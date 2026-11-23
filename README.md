# ER Studio

Editor de modelos entidad-relación: diseñas las tablas y sus relaciones en un diagrama, y ER Studio genera el SQL, los datos de prueba, las consultas y las migraciones para cinco gestores (PostgreSQL, MySQL, SQL Server, SQLite y Oracle).

Hay dos versiones:

- **ER Studio**, la aplicación web. Funciona sin servidor: los proyectos se guardan en el navegador (IndexedDB).
- **ER Studio ++**, la aplicación de escritorio para Windows, macOS y Linux (Tauri 2). Trae todo lo de la web y además se conecta a bases de datos reales y a tus VMs por SSH.

## ER Studio (web y escritorio)

### Modelado

- Diagrama en vivo: entidades, atributos, llaves e índices, con arrastre, ordenado automático, minimapa, leyenda y menú contextual.
- Relaciones 1:1, 1:N y N:M. Las N:M crean su tabla intermedia, y las FK se nombran solas en singular según el idioma de los nombres (`clientes` da `cliente_id`).
- Relaciones recursivas y acciones `ON DELETE` y `ON UPDATE` según lo que permite cada gestor.
- Especializaciones (superclase y subclases), totales o parciales y disjuntas o solapadas. Se pasan a tablas como una tabla por tipo, una sola tabla o una tabla por clase concreta.
- Tipos propios de cada gestor. Al cambiar de gestor, los tipos se convierten y la app avisa de lo que no tiene equivalente.
- Restricciones: llave primaria, UNIQUE, NOT NULL, CHECK con sugerencias por tipo (expresiones regulares, rangos, listas de valores), valores por defecto y ENUM.
- Índices simples, compuestos, únicos, parciales y con orden.
- Validación del modelo y una revisión de diseño:
  - FK sin índice;
  - tablas sin clave natural;
  - columnas repetidas;
  - grupos repetidos y valores múltiples (1FN), dependencias parciales (2FN) y columnas redundantes (3FN);
  - tablas muy anchas y subclases mal mapeadas.

  Varios avisos se corrigen con un clic, y los ignorados se pueden restaurar.
- Deshacer y rehacer, y autoguardado.

### SQL e importación

- DDL completo para cada gestor, con resaltado, nombre de la base y elección de fuente.
- Importar DDL de los cinco gestores, DBML o un archivo SQLite. La vista previa detecta el formato, el gestor y el idioma de los nombres.
- Versiones del modelo: guardar, comparar dos versiones o una con el modelo actual, y generar la migración en el orden correcto para cada gestor, con los cambios destructivos marcados. También se puede restaurar una versión.

### Registros de ejemplo

- Una tabla por entidad para escribir registros, con validación de tipos, llaves, FK, UNIQUE, CHECK y longitudes.
- Generación de registros aleatorios coherentes (respeta las FK, los ENUM, los patrones y los rangos), en el orden en que hay que crearlos.
- Columnas que se ajustan al contenido y se pueden arrastrar.

### Consultas

- Generador de SELECT: eliges las tablas y la app arma los JOIN siguiendo las relaciones, incluidas las tablas intermedias. Permite alias, INNER o LEFT, columnas, WHERE, ORDER BY, DISTINCT y límite.
- WHERE con sugerencias según el tipo de cada columna y el lugar del cursor.
- Editor SQL con resaltado y autocompletado de tablas, columnas, alias y JOIN.
- Ejecución sobre los registros de ejemplo, en el navegador. El SQL de cada gestor se traduce para que SQLite pueda correrlo.

### Exportar

- SQL, con o sin registros, y registros como INSERT, Excel (una hoja por tabla), CSV (.zip) o JSON.
- Imagen PNG o SVG del diagrama, o copiar el PNG al portapapeles.
- OpenAPI 3.1 con un CRUD por tabla, en JSON o YAML.
- Modelo para agentes de IA en Markdown o JSON: todo el modelo, una entidad o un archivo por entidad, con la tecnología destino que elijas (Prisma, SQLAlchemy...).
- Proyecto completo en JSON, para respaldar o compartir.

### Interfaz

- Cuatro idiomas: español, inglés, francés y portugués.
- 27 temas, claros y oscuros, y fuentes elegibles por separado para la interfaz, el diagrama y el código.
- Paneles que se ocultan y cambian de tamaño, atajos de teclado y modelos aleatorios de ejemplo (tienda, biblioteca, universidad, hospital, aerolínea y streaming).

## ER Studio ++ (solo escritorio)

### Conexiones a bases reales

- PostgreSQL (y compatibles como Amazon RDS, Aurora, Neon, Supabase o CockroachDB), MySQL, MariaDB y MySQL HeatWave, SQL Server, Oracle Database y Autonomous Database, y archivos SQLite.
- Bases en tu computadora, en la red o en la nube.
- Rutas hasta el servidor:
  - túneles SSH con contraseña, clave o agente, y varios saltos;
  - proxies SOCKS5, SOCKS4 y HTTP, combinables;
  - hosts importados de `~/.ssh/config`.
- TLS en cinco modos, con CA propia y certificado de cliente.
- SQL Server con instancias con nombre y autenticación de Windows.
- Oracle:
  - por nombre de servicio, SID, cadena de conexión o alias de `tnsnames.ora`;
  - wallet de ADB (el zip que baja la consola de OCI);
  - privilegios SYSDBA o SYSOPER;
  - sin Instant Client.
- Se pueden pegar URLs (`postgres://`, `mysql://`, `mariadb://`), cadenas de SQL Server y cadenas JDBC o de SQL*Plus de Oracle.
- Las contraseñas se guardan en el llavero del sistema, nunca en el proyecto.
- "Probar conexión" muestra cada paso con su tiempo, y la primera vez pide confirmar la huella SSH del servidor.

### Trabajar con la base

- Crear un proyecto desde una base: lee el schema (tablas, tipos, llaves, FK, CHECK e índices) y copia las filas que quieras, sin dejar referencias rotas.
- Consultas en vivo:
  - las lecturas corren en una transacción que siempre se deshace;
  - las escrituras hay que permitirlas en la conexión, y esperan "Confirmar cambios" o "Deshacer" (sin decisión, se deshacen solas en 2 minutos);
  - un DELETE o UPDATE sin WHERE, un DROP, un TRUNCATE o un ALTER piden escribir el nombre de la tabla, y en producción toda escritura pide el nombre de la conexión.
- Comparar una base real con el modelo y aplicar la migración, en una transacción donde el gestor lo permite.

### VMs y terminal

- VMs guardadas con su usuario, su forma de iniciar sesión y el bastión por el que se llega a ellas. Sirven de salto en cualquier conexión.
- Terminal SSH en un panel con pestañas. Por defecto usa el shell del sistema, o el que elijas: bash, zsh, sh, fish, PowerShell, cmd u otro comando.

### Actualizaciones

- La app busca versiones nuevas al abrirse y cada 6 horas, las descarga y comprueba su firma, y avisa para reiniciar.

### Instalar

Descarga el instalador de tu sistema desde [Releases](https://github.com/emiola-feduro/er-studio/releases/latest). Los instaladores todavía no están firmados:

- **Windows:** `ER.Studio.++_<versión>_x64-setup.exe`. SmartScreen mostrará un aviso: elige "Más información" y luego "Ejecutar de todas formas".
- **macOS:** el `.dmg` de tu procesador (`aarch64` para Apple Silicon, `x64` para Intel). Arrastra la app a Aplicaciones. La primera vez, macOS dirá que no puede verificarla: ciérralo, abre Configuración del Sistema, ve a "Privacidad y seguridad" y pulsa "Abrir de todas formas" junto a ER Studio ++. Si un instalador anterior a la 0.4.1 dice que la app "está dañada", quítale la marca de descarga en Terminal:

  ```bash
  xattr -dr com.apple.quarantine "/Applications/ER Studio ++.app"
  ```
- **Linux:** `.deb`, `.rpm` o `.AppImage`.

## Desarrollo

```bash
bun install
bun run dev      # la web en http://127.0.0.1:5173
bun run test     # Vitest
bun run build
```

La app de escritorio se compila en GitHub Actions (workflow "Desktop release"). Para compilarla en tu computadora hacen falta Rust y las dependencias de Tauri 2 de tu sistema; luego:

```bash
bunx tauri dev
```

Los tests de conexiones corren contra servidores en contenedores:

```bash
src-tauri/crates/er-db/tests/env/up.sh
```

```bash
cd src-tauri && ERDB_TEST=1 cargo test -p er-db
```

`ERDB_MSSQL=1` agrega SQL Server y `ERDB_ORACLE=1` agrega Oracle.

### Estructura

- `src/domain/`: modelo, inferencia del esquema físico, tipos por gestor, DDL, migraciones, registros, consultas, revisión de diseño, importación y conexiones (lógica pura, con tests).
- `src/stores/`: estado con Zustand (proyecto con deshacer y autoguardado, interfaz, preferencias, conexiones y terminales).
- `src/components/`: `ui`, `layout` y `dynamic`; `src/hooks/` por categoría.
- `src/lib/`: temas, fuentes, exportaciones y las llamadas al lado de escritorio.
- `src-tauri/`: la app de escritorio. `crates/er-db` tiene las conexiones (SSH, proxies, TLS, drivers, lectura de schemas, sesiones y terminales).
