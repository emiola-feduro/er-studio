//! The intermediate representation the interface's importer reads (src/domain/import/ir.ts): plain
//! tables, columns and keys. A schema read from a live database comes out in this shape, so it turns
//! into a project exactly like a pasted DDL does.

use serde::Serialize;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrColumn {
    pub name: String,
    /// Type as written, without parameters: VARCHAR, NUMERIC, TIMESTAMP WITH TIME ZONE...
    #[serde(rename = "type")]
    pub kind: String,
    pub params: Vec<String>,
    pub not_null: bool,
    pub pk: bool,
    pub unique: bool,
    pub auto_increment: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrKey {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrCheck {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub expression: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrForeignKey {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub columns: Vec<String>,
    pub ref_table: String,
    pub ref_columns: Vec<String>,
    pub on_delete: String,
    pub on_update: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct IrIndexColumn {
    pub name: String,
    /// "ASC" or "DESC".
    pub order: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrIndex {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub columns: Vec<IrIndexColumn>,
    pub unique: bool,
    #[serde(rename = "where", skip_serializing_if = "Option::is_none")]
    pub predicate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IrTable {
    pub name: String,
    pub columns: Vec<IrColumn>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pk: Option<IrKey>,
    pub uniques: Vec<IrKey>,
    pub checks: Vec<IrCheck>,
    pub foreign_keys: Vec<IrForeignKey>,
    pub indexes: Vec<IrIndex>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ir {
    pub tables: Vec<IrTable>,
    pub many_to_many: Vec<()>,
    pub dialect: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database_name: Option<String>,
    /// What was left out (views, expression indexes, generated columns...), shown in the preview.
    pub skipped: Vec<String>,
}
