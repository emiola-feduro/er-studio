//! PostgreSQL: the schema from pg_catalog.

use std::collections::{HashMap, HashSet};

use super::{action, flag, in_list, numbers, opt, quote_literal, rows, simplify_check, split_type, text, SchemaInfo, SchemaRead, TableSource};
use crate::driver::Driver;
use crate::error::Result;
use crate::ir::{Ir, IrCheck, IrColumn, IrForeignKey, IrIndex, IrIndexColumn, IrKey, IrTable};

pub async fn list_schemas(driver: &Driver) -> Result<Vec<SchemaInfo>> {
    let found = rows(
        driver,
        "SELECT n.nspname AS name, count(c.oid) FILTER (WHERE c.relkind IN ('r', 'p')) AS tables
         FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid
         WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%'
         GROUP BY n.nspname ORDER BY n.nspname",
    )
    .await?;
    Ok(found
        .iter()
        .map(|r| SchemaInfo {
            name: text(r, "name"),
            tables: text(r, "tables").parse().unwrap_or(0),
        })
        .collect())
}

pub async fn read_schema(driver: &Driver, schemas: &[String]) -> Result<SchemaRead> {
    let schema_list = in_list(schemas.iter().map(|s| quote_literal(s)));
    let mut ir = Ir {
        dialect: "postgresql",
        ..Default::default()
    };
    ir.database_name = rows(driver, "SELECT current_database() AS db").await?.first().and_then(|r| opt(r, "db"));

    // Tables (partitioned parents included, partitions left out).
    let tables = rows(
        driver,
        &format!(
            "SELECT c.oid, n.nspname AS schema, c.relname AS name
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname IN ({schema_list})
             ORDER BY n.nspname, c.relname"
        ),
    )
    .await?;
    let mut repeated: HashMap<String, u32> = HashMap::new();
    for t in &tables {
        *repeated.entry(text(t, "name").to_lowercase()).or_default() += 1;
    }
    let mut names: HashMap<String, String> = HashMap::new(); // oid → IR name
    let mut order = Vec::new();
    let mut sources = Vec::new();
    for t in &tables {
        let (oid, schema, name) = (text(t, "oid"), text(t, "schema"), text(t, "name"));
        let ir_name = if repeated[&name.to_lowercase()] > 1 {
            format!("{schema}_{name}")
        } else {
            name.clone()
        };
        names.insert(oid.clone(), ir_name.clone());
        order.push(oid);
        sources.push(TableSource {
            name: ir_name,
            schema,
            table: name,
            key: Vec::new(),
        });
    }
    let oids = in_list(order.iter().cloned());

    // Views and other relations do not become tables; say so.
    for other in rows(
        driver,
        &format!(
            "SELECT c.relname AS name, c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('v', 'm', 'f') AND n.nspname IN ({schema_list}) ORDER BY c.relname"
        ),
    )
    .await?
    {
        let kind = match text(&other, "kind").as_str() {
            "v" => "VIEW",
            "m" => "MATERIALIZED VIEW",
            _ => "FOREIGN TABLE",
        };
        ir.skipped.push(format!("{kind} {}", text(&other, "name")));
    }

    // Enum labels by type.
    let mut enums: HashMap<String, Vec<String>> = HashMap::new();
    for e in rows(
        driver,
        "SELECT enumtypid AS oid, enumlabel AS label FROM pg_enum ORDER BY enumtypid, enumsortorder",
    )
    .await?
    {
        enums.entry(text(&e, "oid")).or_default().push(text(&e, "label"));
    }

    // Columns. to_jsonb(a) reads attidentity and attgenerated without failing on servers that lack them.
    let mut columns: HashMap<String, Vec<(i64, IrColumn)>> = HashMap::new();
    for c in rows(
        driver,
        &format!(
            "SELECT a.attrelid AS rel, a.attnum AS num, a.attname AS name, a.attnotnull AS not_null,
                    CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) ELSE format_type(a.atttypid, a.atttypmod) END AS type,
                    t.typtype AS typtype, t.oid AS type_oid, pg_get_expr(d.adbin, d.adrelid) AS default_value,
                    to_jsonb(a) ->> 'attidentity' AS identity, to_jsonb(a) ->> 'attgenerated' AS generated
             FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
             LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE a.attrelid IN ({oids}) AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY a.attrelid, a.attnum"
        ),
    )
    .await?
    {
        let rel = text(&c, "rel");
        let name = text(&c, "name");
        let (mut kind, params) = split_type(&text(&c, "type"));
        let default = opt(&c, "default_value");
        let identity = opt(&c, "identity").is_some_and(|i| i == "a" || i == "d");
        let serial = default.as_deref().is_some_and(|d| d.starts_with("nextval("));
        // A generated column keeps its expression where a default would be; the model has no such column, so it
        // comes in as a plain one and the note shows what is not kept.
        let generated = opt(&c, "generated").is_some_and(|g| g == "s");
        if generated {
            let table = names.get(&rel).cloned().unwrap_or_default();
            ir.skipped
                .push(format!("{table}.{name} GENERATED ALWAYS AS ({}) STORED", default.clone().unwrap_or_default()));
        }
        let enum_values = (text(&c, "typtype") == "e").then(|| enums.get(&text(&c, "type_oid")).cloned().unwrap_or_default());
        if enum_values.is_some() {
            kind = "ENUM".into();
        }
        let column = IrColumn {
            name,
            kind,
            params,
            not_null: flag(&c, "not_null"),
            auto_increment: identity || serial,
            default_value: if serial || generated { None } else { default },
            enum_values,
            ..Default::default()
        };
        columns.entry(rel).or_default().push((text(&c, "num").parse().unwrap_or(0), column));
    }
    let column_name = |rel: &str, num: i64| {
        columns
            .get(rel)
            .and_then(|cols| cols.iter().find(|(n, _)| *n == num))
            .map(|(_, c)| c.name.clone())
    };

    let mut built: HashMap<String, IrTable> = order
        .iter()
        .map(|oid| {
            let table = IrTable {
                name: names[oid].clone(),
                columns: columns.get(oid).map(|cols| cols.iter().map(|(_, c)| c.clone()).collect()).unwrap_or_default(),
                ..Default::default()
            };
            (oid.clone(), table)
        })
        .collect();

    // Constraints: primary key, unique, foreign keys and checks.
    let mut constraint_indexes = HashSet::new();
    for k in rows(
        driver,
        &format!(
            "SELECT conrelid AS rel, conname AS name, contype AS kind, conkey AS cols, confrelid AS ref, confkey AS ref_cols,
                    confdeltype AS on_delete, confupdtype AS on_update, conindid AS index, pg_get_constraintdef(oid) AS definition
             FROM pg_constraint WHERE conrelid IN ({oids}) AND contype IN ('p', 'u', 'f', 'c') ORDER BY conrelid, conname"
        ),
    )
    .await?
    {
        let rel = text(&k, "rel");
        let Some(table) = built.get_mut(&rel) else { continue };
        let cols: Vec<String> = numbers(&text(&k, "cols")).into_iter().filter_map(|n| column_name(&rel, n)).collect();
        let name = opt(&k, "name");
        constraint_indexes.insert(text(&k, "index"));
        match text(&k, "kind").as_str() {
            "p" => {
                if let [only] = cols.as_slice() {
                    if let Some(column) = table.columns.iter_mut().find(|c| &c.name == only) {
                        column.pk = true;
                    }
                }
                table.pk = Some(IrKey { name, columns: cols });
            }
            "u" => table.uniques.push(IrKey { name, columns: cols }),
            "c" => {
                // A NOT NULL written as a check is already in the column.
                let expression = simplify_check(&text(&k, "definition"));
                table.checks.push(IrCheck { name, expression });
            }
            "f" => {
                let reference = text(&k, "ref");
                let Some(ref_table) = names.get(&reference).cloned() else {
                    ir.skipped
                        .push(format!("FOREIGN KEY {} → table outside the chosen schemas", name.unwrap_or_default()));
                    continue;
                };
                let ref_columns = numbers(&text(&k, "ref_cols")).into_iter().filter_map(|n| column_name(&reference, n)).collect();
                table.foreign_keys.push(IrForeignKey {
                    name,
                    columns: cols,
                    ref_table,
                    ref_columns,
                    on_delete: action(&text(&k, "on_delete")),
                    on_update: action(&text(&k, "on_update")),
                });
            }
            _ => {}
        }
    }

    // Indexes that do not back a primary key or unique constraint.
    for i in rows(
        driver,
        &format!(
            "SELECT i.indrelid AS rel, i.indexrelid AS oid, ci.relname AS name, i.indisunique AS is_unique, i.indkey AS cols, i.indoption AS options,
                    pg_get_expr(i.indpred, i.indrelid) AS predicate, am.amname AS method
             FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid JOIN pg_am am ON am.oid = ci.relam
             WHERE i.indrelid IN ({oids}) ORDER BY i.indrelid, ci.relname"
        ),
    )
    .await?
    {
        if constraint_indexes.contains(&text(&i, "oid")) {
            continue;
        }
        let rel = text(&i, "rel");
        let name = text(&i, "name");
        let nums = numbers(&text(&i, "cols"));
        let options = numbers(&text(&i, "options"));
        if nums.contains(&0) {
            ir.skipped.push(format!("INDEX {name} (expression)"));
            continue;
        }
        let Some(table) = built.get_mut(&rel) else { continue };
        let index_columns = nums
            .iter()
            .enumerate()
            .filter_map(|(position, n)| {
                column_name(&rel, *n).map(|name| IrIndexColumn {
                    name,
                    order: if options.get(position).is_some_and(|o| o & 1 == 1) { "DESC" } else { "ASC" },
                })
            })
            .collect();
        let method = opt(&i, "method").filter(|m| m != "btree");
        table.indexes.push(IrIndex {
            name: Some(name),
            columns: index_columns,
            unique: flag(&i, "is_unique"),
            predicate: opt(&i, "predicate"),
            method,
        });
    }

    for source in &mut sources {
        let oid = names.iter().find(|(_, n)| **n == source.name).map(|(o, _)| o.clone()).unwrap_or_default();
        source.key = built.get(&oid).and_then(|t| t.pk.as_ref()).map(|pk| pk.columns.clone()).unwrap_or_default();
    }
    ir.tables = order.iter().filter_map(|oid| built.remove(oid)).collect();
    Ok(SchemaRead { ir, sources })
}
