import { t } from '../i18n';
import type { Edge, Node } from '@xyflow/react';
import { relationshipKind } from '../domain/model';
import type { DialectId, EndMarker, ForeignKey, Project, Schema, Table } from '../domain/types';

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

/** Handle on each attribute row; dragging it onto another entity creates a FK to that attribute. */
export const ATTR_HANDLE_PREFIX = 'attr:';

export const handleId = (columnId: string, side: 'L' | 'R', type: 's' | 't') => `${columnId}|${side}|${type}`;

type NodeInput = {
  project: Project;
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

export const buildNodes = ({ project, schema, selectedId, hoveredFkId, issueCounts }: NodeInput): TableNodeType[] => {
  const hovered = hoveredFkId ? schema.foreignKeys.find((fk) => fk.id === hoveredFkId) : undefined;
  return schema.tables.map((table) => {
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
    .filter((fk) => fk.columnIds.length > 0 && fk.refColumnIds.length > 0)
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
