import dagre from '@dagrejs/dagre';
import type { Position, Schema } from '../domain/types';
import { NODE_WIDTH } from './graph';

export type LayoutNode = { id: string; width: number; height: number };
/** [referenced table, table holding the FK]: referenced tables end up on the left. */
export type LayoutEdge = [string, string];

/** Left to right layout with dagre. Returns the top left corner of each node. */
export const layoutTables = (nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, Position> => {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  for (const [from, to] of edges) if (from !== to) graph.setEdge(from, to);
  dagre.layout(graph);
  return new Map(
    nodes.map((node) => {
      const { x, y, width, height } = graph.node(node.id);
      return [node.id, { x: Math.round(x - width / 2), y: Math.round(y - height / 2) }];
    }),
  );
};

/** Header plus one line per column, close to what the canvas renders before it measures. */
const estimatedHeight = (columns: number) => 46 + Math.max(1, columns) * 26;

/** Layout for a schema that has not been drawn yet, such as a freshly generated model. */
export const layoutSchema = (schema: Schema) =>
  layoutTables(
    schema.tables.map((t) => ({ id: t.id, width: NODE_WIDTH, height: estimatedHeight(t.columns.length) })),
    schema.foreignKeys.map((fk) => [fk.refTableId, fk.tableId]),
  );
