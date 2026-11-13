import { t } from '../i18n';
import { createAttribute, createEntity, createProject, createRelationship, syncJunctions, uid } from '../domain/model';
import type { Project } from '../domain/types';

/** A small starter model so the first visit shows every kind of relationship. */
export const createSampleProject = (): Project => {
  const dialect = 'postgresql';
  const project = createProject(t('projects.sampleName'), dialect);
  const attr = (name: string, type: string, extra: Parameters<typeof createAttribute>[1] = {}) =>
    createAttribute(dialect, { name, type, length: undefined, ...extra });

  const cliente = createEntity(dialect, 'cliente', { x: 0, y: 0 });
  cliente.attributes.push(
    attr('nombre', 'VARCHAR', { length: 120, nullable: false }),
    attr('email', 'VARCHAR', { length: 160, nullable: false, unique: true }),
    attr('creado_en', 'TIMESTAMPTZ', { nullable: false, defaultValue: 'CURRENT_TIMESTAMP' }),
  );

  const pedido = createEntity(dialect, 'pedido', { x: 420, y: 0 });
  pedido.attributes.push(
    attr('fecha', 'DATE', { nullable: false }),
    attr('estado', 'VARCHAR', { length: 20, nullable: false, defaultValue: "'pendiente'" }),
  );

  const producto = createEntity(dialect, 'producto', { x: 840, y: 0 });
  producto.attributes.push(
    attr('nombre', 'VARCHAR', { length: 120, nullable: false }),
    attr('precio', 'NUMERIC', { precision: 10, scale: 2, nullable: false, check: 'precio >= 0' }),
  );

  const empleado = createEntity(dialect, 'empleado', { x: 0, y: 360 });
  empleado.attributes.push(attr('nombre', 'VARCHAR', { length: 120, nullable: false }));

  project.entities.push(cliente, pedido, producto, empleado);

  const compra = createRelationship([cliente.id, pedido.id], '1:N');
  compra.onDelete = 'CASCADE';

  const detalle = createRelationship([pedido.id, producto.id], 'N:M');
  detalle.onDelete = 'CASCADE';

  const jefatura = createRelationship([empleado.id, empleado.id], '1:N');
  jefatura.participants[0].role = 'jefe';
  jefatura.participants[1].role = 'subordinado';

  project.relationships.push(compra, detalle, jefatura);
  syncJunctions(project);

  const junction = project.entities.find((e) => e.id === detalle.junctionId);
  if (junction) {
    junction.position = { x: 620, y: 320 };
    junction.attributes.push(
      attr('cantidad', 'INTEGER', { nullable: false, defaultValue: '1', check: 'cantidad > 0' }),
      attr('precio_unitario', 'NUMERIC', { precision: 10, scale: 2, nullable: false }),
    );
  }

  pedido.indexes.push({
    id: 'sample-idx',
    name: '',
    nameIsCustom: false,
    unique: false,
    columns: [{ columnId: pedido.attributes[1].id, order: 'DESC' }],
  });

  // A few plain rows so the records view has something to show.
  const fk = (rel: typeof compra, participantIndex: number, ref: typeof cliente) =>
    `fk:${rel.id}:${rel.participants[participantIndex].id}:${ref.attributes[0].id}`;
  const [cId, cNombre, cEmail] = cliente.attributes.map((a) => a.id);
  const [pId, pFecha, pEstado] = pedido.attributes.map((a) => a.id);
  const [prId, prNombre, prPrecio] = producto.attributes.map((a) => a.id);
  const row = (values: Record<string, string>) => ({ id: uid(), values });
  project.records = {
    [cliente.id]: [
      row({ [cId]: '1', [cNombre]: 'Ana Pérez', [cEmail]: 'ana@ejemplo.com' }),
      row({ [cId]: '2', [cNombre]: 'Luis Gómez', [cEmail]: 'luis@ejemplo.com' }),
    ],
    [producto.id]: [
      row({ [prId]: '1', [prNombre]: 'Teclado', [prPrecio]: '45.90' }),
      row({ [prId]: '2', [prNombre]: 'Ratón', [prPrecio]: '19.50' }),
    ],
    [pedido.id]: [row({ [pId]: '1', [pFecha]: '2026-11-02', [pEstado]: "pendiente", [fk(compra, 0, cliente)]: '1' })],
  };
  if (junction) {
    const [cantidad, precioUnitario] = junction.attributes.map((a) => a.id);
    project.records[junction.id] = [
      row({ [fk(detalle, 0, pedido)]: '1', [fk(detalle, 1, producto)]: '1', [cantidad]: '2', [precioUnitario]: '45.90' }),
    ];
  }

  return project;
};
