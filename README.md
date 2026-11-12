# ER Studio

Editor local de diagramas entidad-relación. Los proyectos se guardan en el navegador (IndexedDB).

```bash
bun install
bun run dev      # http://localhost:5173
bun run test     # Vitest: inferencia, DDL, índices, tipos y validación de registros
bun run build
```

- `src/domain/`: modelo, inferencia del esquema físico, tipos por gestor, DDL, validación del modelo y de registros (lógica pura, con tests).
- `src/lib/excel.ts`: exportación de registros a .xlsx, una hoja por tabla (exceljs se carga solo al exportar).
- `src/stores/`: estado con Zustand (proyecto con deshacer y autoguardado, interfaz, preferencias).
- `src/components/`: `ui`, `layout` y `dynamic`; `src/hooks/` por categoría.
- `src/lib/themes/`: temas y fuentes.
