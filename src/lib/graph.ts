import { t } from '../i18n';
import type { Edge, Node } from '@xyflow/react';
import { attributeColumn } from '../domain/inference';
import { relationshipKind } from '../domain/model';
import type { DialectId, EndMarker, ForeignKey, Project, Schema, Specialization, Table } from '../domain/types';

export type TableNodeData = {
  table: Table;
  dialect: DialectId;
  color?: string;
  kindLabel?: string;
  highlighted: string[];
  indexedColumnIds: string[];
  issueCount: number;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

export type FkEdgeData = {
  fk: ForeignKey;
  holderEnd: EndMarker;
  refEnd: EndMarker;
  highlighted: boolean;
  showLabel: boolean;
};

export type FkEdgeType = Edge<FkEdgeData, 'fk'>;

export const NODE_WIDTH = 280;

/* Specialization (EER): a "d" or "o" circle between the supertype and its subtypes. */

export const SPEC_NODE_PREFIX = 'spec-node:';
export const SPEC_NODE_SIZE = 34;
export const specNodeId = (specId: string) => `${SPEC_NODE_PREFIX}${specId}`;

export type SpecNodeData = { specId: string; disjoint: boolean; total: boolean; supertypeName: string; highlighted: boolean };
export type SpecNodeType = Node<SpecNodeData, 'spec'>;

export type SpecEdgeData = { specId: string; part: 'super' | 'sub'; total: boolean; highlighted: boolean };
export type SpecEdgeType = Edge<SpecEdgeData, 'spec'>;

export type DiagramNode = TableNodeType | SpecNodeType;

/** Header plus one line per column, close to what the canvas renders before it measures. */
export const estimatedNodeHeight = (columns: number) => 46 + Math.max(1, columns) * 26;

/** Where the circle goes when it was never moved: under the supertype, halfway to its subtypes. */
export const defaultSpecPosition = (spec: Specialization, project: Project, heights?: Map<string, number>) => {
  const entity = (id: string) => project.entities.find((e) => e.id === id);
  const supertype = entity(spec.supertypeId);
  if (!supertype) return { x: 0, y: 0 };
  // The drawn height when known: a single table makes the supertype taller than its own attributes.
  const bottom = supertype.position.y + (heights?.get(supertype.id) ?? estimatedNodeHeight(supertype.attributes.length));
  const subtypes = spec.subtypeIds.map(entity).filter((e) => e !== undefined);
  const top = subtypes.length ? Math.min(...subtypes.map((s) => s!.position.y)) : bottom + 120;
  const y = top > bottom ? (bottom + top) / 2 : bottom + 50;
  return { x: Math.round(supertype.position.x + NODE_WIDTH / 2 - SPEC_NODE_SIZE / 2), y: Math.round(y - SPEC_NODE_SIZE / 2) };
};

/** Handle on each attribute row; dragging it onto another entity creates a FK to that attribute. */
export const ATTR_HANDLE_PREFIX = 'attr:';

export const handleId = (columnId: string, side: 'L' | 'R', type: 's' | 't') => `${columnId}|${side}|${type}`;

type NodeInput = {
  project: Project;
  /** Heights the canvas measured, to place things next to tables as they are drawn. */
  heights?: Map<string, number>;
  schema: Schema;
  selectedId?: string;
  hoveredFkId: string | null;
  issueCounts: Map<string, number>;
};

const junctionLabel = (project: Project, table: Table) => {
  const entity = project.entities.find((e) => e.id === table.id);
  const rel = project.relationships.find((r) => r.id === entity?.junction?.relationshipId);
  if (!rel) return undefined;
  const kind = relationshipKind(rel);
  if (kind === 'ternaria' || kind === 'n-aria') return kind === 'ternaria' ? t('relKind.ternaryLabel') : t('relKind.naryCount', { count: rel.participants.length });
  return kind === 'recursiva' ? t('relKind.recursiveNM') : 'N:M';
};

export const buildNodes = ({ project, schema, selectedId, hoveredFkId, issueCounts, heights }: NodeInput): DiagramNode[] => {
  const hovered = hoveredFkId ? schema.foreignKeys.find((fk) => fk.id === hoveredFkId) : undefined;
  const specs = project.specializations ?? [];
  // Subtypes stored in their supertype's table (single table) still get their own box.
  const inTables = new Set(schema.tables.map((t) => t.id));
  const merged: { table: Table; into: string }[] = [];
  for (const spec of specs) {
    if (spec.mapping !== 'single-table') continue;
    const supertype = project.entities.find((e) => e.id === spec.supertypeId);
    const into = supertype?.name ?? '';
    // Only what moves into the supertype's table: not its key, not what the supertype already has.
    const taken = new Set((supertype?.attributes ?? []).map((a) => a.name.toLowerCase()));
    for (const id of spec.subtypeIds) {
      const entity = project.entities.find((e) => e.id === id);
      if (!entity || inTables.has(id)) continue;
      const moved = entity.attributes.filter((a) => !a.pk && !taken.has(a.name.toLowerCase()));
      merged.push({ into, table: { id, name: entity.name, kind: 'entity', columns: moved.map((a) => ({ ...attributeColumn(a), nullable: true })), uniques: [], foreignKeys: [], indexes: [] } });
    }
  }
  const specNodes: SpecNodeType[] = specs
    .filter((spec) => project.entities.some((e) => e.id === spec.supertypeId))
    .map((spec) => ({
      id: specNodeId(spec.id),
      type: 'spec',
      position: spec.position ?? defaultSpecPosition(spec, project, heights),
      selected: selectedId === spec.id,
      data: {
        specId: spec.id,
        disjoint: spec.disjoint,
        total: spec.total,
        supertypeName: project.entities.find((e) => e.id === spec.supertypeId)?.name ?? '',
        highlighted: selectedId === spec.id,
      },
    }));
  const mergedNodes: TableNodeType[] = merged.map(({ table, into }) => {
    const entity = project.entities.find((e) => e.id === table.id)!;
    return {
      id: table.id,
      type: 'table',
      position: entity.position,
      selected: selectedId === table.id,
      data: { table, dialect: project.dialect, color: entity.color, kindLabel: t('spec.inTable', { table: into }), highlighted: [], indexedColumnIds: [], issueCount: issueCounts.get(table.id) ?? 0 },
    };
  });
  const tableNodes: TableNodeType[] = schema.tables.map((table) => {
    const entity = project.entities.find((e) => e.id === table.id)!;
    const highlighted = hovered
      ? [
          ...(hovered.tableId === table.id ? hovered.columnIds : []),
          ...(hovered.refTableId === table.id ? hovered.refColumnIds : []),
        ]
      : [];
    return {
      id: table.id,
      type: 'table',
      position: entity.position,
      selected: selectedId === table.id,
      data: {
        table,
        dialect: project.dialect,
        color: entity.color,
        kindLabel: table.kind === 'junction' ? junctionLabel(project, table) : undefined,
        highlighted,
        indexedColumnIds: table.indexes.flatMap((i) => i.columns.map((c) => c.columnId)),
        issueCount: issueCounts.get(table.id) ?? 0,
      },
    };
  });
  return [...tableNodes, ...mergedNodes, ...specNodes];
};

type Box = { x: number; y: number; width: number; height: number };

/** The side of a table that faces a point: the one in the direction where the point is farther away. */
const sideFacing = (box: Box, point: { x: number; y: number }) => {
  const dx = point.x < box.x ? box.x - point.x : point.x > box.x + box.width ? point.x - box.x - box.width : 0;
  const dy = point.y < box.y ? box.y - point.y : point.y > box.y + box.height ? point.y - box.y - box.height : 0;
  if (dx > dy) return point.x < box.x ? 'l' : 'r';
  return point.y < box.y + box.height / 2 ? 't' : 'b';
};

/** Lines of each specialization: supertype to circle (double when total), circle to each subtype. */
export const buildSpecEdges = (project: Project, nodes: Node[], selectedSpecId?: string): SpecEdgeType[] => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxOf = (id: string): Box | undefined => {
    const node = byId.get(id);
    return node ? { x: node.position.x, y: node.position.y, width: node.measured?.width ?? NODE_WIDTH, height: node.measured?.height ?? 120 } : undefined;
  };
  return (project.specializations ?? [])
    .filter((spec) => project.entities.some((e) => e.id === spec.supertypeId))
    .flatMap((spec) => {
      const highlighted = spec.id === selectedSpecId;
      const node = specNodeId(spec.id);
      const circle = byId.get(node)?.position ?? defaultSpecPosition(spec, project);
      const center = { x: circle.x + SPEC_NODE_SIZE / 2, y: circle.y + SPEC_NODE_SIZE / 2 };
      const side = (id: string) => {
        const box = boxOf(id);
        return box ? sideFacing(box, center) : 'b';
      };
      const toSuper: SpecEdgeType = {
        id: `spec-edge:${spec.id}:super`,
        type: 'spec',
        source: spec.supertypeId,
        sourceHandle: `spec-${side(spec.supertypeId)}-s`,
        target: node,
        targetHandle: 'in',
        selected: highlighted,
        data: { specId: spec.id, part: 'super', total: spec.total, highlighted },
      };
      const toSubs: SpecEdgeType[] = spec.subtypeIds
        .filter((id) => project.entities.some((e) => e.id === id))
        .map((id) => ({
          id: `spec-edge:${spec.id}:${id}`,
          type: 'spec',
          source: node,
          sourceHandle: 'out',
          target: id,
          targetHandle: `spec-${side(id)}-t`,
          selected: highlighted,
          data: { specId: spec.id, part: 'sub', total: spec.total, highlighted },
        }));
      return [toSuper, ...toSubs];
    });
};

type EdgeInput = {
  schema: Schema;
  nodes: Node[];
  selectedRelationshipId?: string;
  hoveredFkId: string | null;
  showLabels: boolean;
};

const centerX = (node: Node | undefined) => (node ? node.position.x + (node.measured?.width ?? NODE_WIDTH) / 2 : 0);

export const buildEdges = ({ schema, nodes, selectedRelationshipId, hoveredFkId, showLabels }: EdgeInput): FkEdgeType[] => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return schema.foreignKeys
    // The FK a subtype gets from its supertype is drawn as the specialization, not as a relationship.
    .filter((fk) => fk.columnIds.length > 0 && fk.refColumnIds.length > 0 && !fk.relationshipId.startsWith('spec:'))
    .map((fk) => {
      const self = fk.tableId === fk.refTableId;
      const holderLeft = centerX(byId.get(fk.tableId)) <= centerX(byId.get(fk.refTableId));
      const sourceSide = self || holderLeft ? 'R' : 'L';
      const targetSide = self ? 'R' : holderLeft ? 'L' : 'R';
      return {
        id: fk.id,
        type: 'fk',
        source: fk.tableId,
        target: fk.refTableId,
        sourceHandle: handleId(fk.columnIds[0], sourceSide, 's'),
        targetHandle: handleId(fk.refColumnIds[0], targetSide, 't'),
        selected: fk.relationshipId === selectedRelationshipId,
        data: {
          fk,
          holderEnd: fk.holderEnd,
          refEnd: fk.refEnd,
          highlighted: hoveredFkId === fk.id || fk.relationshipId === selectedRelationshipId,
          showLabel: showLabels,
        },
      };
    });
};
