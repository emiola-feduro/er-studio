import { t } from '../../i18n';
import {
  applyNodeChanges,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  useReactFlow,
} from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { linkAttributeAsFk, moveEntities } from '../../lib/actions';
import { ATTR_HANDLE_PREFIX, buildEdges, buildNodes, buildSpecEdges, defaultSpecPosition, SPEC_NODE_PREFIX, type DiagramNode } from '../../lib/graph';
import useProjectStore from '../../stores/use-project-store';
import useUiStore from '../../stores/use-ui-store';
import useDerived from '../data/use-derived';

const nodeIdAtPoint = (event: MouseEvent | TouchEvent) => {
  const point = 'changedTouches' in event ? event.changedTouches[0] : event;
  const el = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node');
  return el?.getAttribute('data-id') ?? undefined;
};

/** Pointer position, or the element's corner when the menu key opened the menu (no pointer). */
const pointOf = (event: ReactMouseEvent | MouseEvent) => {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const rect = (event.target as Element).getBoundingClientRect();
  return { x: rect.left + 16, y: rect.top + 16 };
};

/** Nodes, edges and handlers for the ER canvas, derived from the open project. */
const useDiagramGraph = () => {
  const project = useProjectStore((s) => s.project);
  const derived = useDerived();
  const selection = useUiStore((s) => s.selection);
  const hoveredFkId = useUiStore((s) => s.hoveredFkId);
  const showFkLabels = useUiStore((s) => s.showFkLabels);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const { screenToFlowPosition } = useReactFlow();

  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of derived?.issues ?? []) {
      if (issue.entityId) counts.set(issue.entityId, (counts.get(issue.entityId) ?? 0) + 1);
    }
    return counts;
  }, [derived]);

  useEffect(() => {
    if (!project || !derived) {
      setNodes([]);
      return;
    }
    // Keep measured sizes so edges can pick sides, and circles sit under tables, without waiting to measure again.
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      const heights = new Map(prev.flatMap((n) => (n.measured?.height ? [[n.id, n.measured.height] as const] : [])));
      const next = buildNodes({
        project,
        schema: derived.schema,
        selectedId: selection?.kind === 'entity' || selection?.kind === 'specialization' ? selection.id : undefined,
        hoveredFkId,
        issueCounts,
        heights,
      });
      return next.map((n) => ({ ...n, measured: measured.get(n.id) }));
    });
  }, [project, derived, selection, hoveredFkId, issueCounts]);

  // Circles never moved by hand go under their supertype as it is drawn, once its height is measured.
  const measuredKey = nodes.map((n) => `${n.id}:${n.measured?.height ?? ''}`).join('|');
  useEffect(() => {
    if (!project?.specializations?.length) return;
    setNodes((prev) => {
      const heights = new Map(prev.flatMap((n) => (n.measured?.height ? [[n.id, n.measured.height] as const] : [])));
      let changed = false;
      const next = prev.map((n) => {
        if (n.type !== 'spec') return n;
        const spec = project.specializations!.find((s) => `${SPEC_NODE_PREFIX}${s.id}` === n.id);
        if (!spec || spec.position) return n;
        const position = defaultSpecPosition(spec, project, heights);
        if (position.x === n.position.x && position.y === n.position.y) return n;
        changed = true;
        return { ...n, position };
      });
      return changed ? next : prev;
    });
  }, [measuredKey, project]);

  const edges = useMemo(
    () =>
      derived && project
        ? [
            ...buildEdges({
              schema: derived.schema,
              nodes,
              selectedRelationshipId: selection?.kind === 'relationship' ? selection.id : undefined,
              hoveredFkId,
              showLabels: showFkLabels,
            }),
            ...buildSpecEdges(project, nodes, selection?.kind === 'specialization' ? selection.id : undefined),
          ]
        : [],
    [derived, project, nodes, selection, hoveredFkId, showFkLabels],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) =>
      setNodes((current) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), current)),
    [],
  );

  const onNodeDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    moveEntities(dragged.map((n) => ({ id: n.id, position: n.position })));
  }, []);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.id.startsWith(SPEC_NODE_PREFIX)) useUiStore.getState().select({ kind: 'specialization', id: node.id.slice(SPEC_NODE_PREFIX.length) });
    else useUiStore.getState().select({ kind: 'entity', id: node.id });
  }, []);

  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    if (edge.type === 'spec') {
      useUiStore.getState().select({ kind: 'specialization', id: (edge.data as { specId: string }).specId });
      return;
    }
    const fk = derived?.schema.foreignKeys.find((f) => f.id === edge.id);
    if (fk) useUiStore.getState().select({ kind: 'relationship', id: fk.relationshipId });
  }, [derived]);

  const onPaneClick = useCallback(() => useUiStore.getState().select(null), []);

  const onEdgeMouseEnter = useCallback((_: unknown, edge: Edge) => edge.type === 'fk' && useUiStore.getState().setHoveredFk(edge.id), []);
  const onEdgeMouseLeave = useCallback(() => useUiStore.getState().setHoveredFk(null), []);

  /** Right click (or the menu key) on a table opens its actions. */
  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    const { x, y } = pointOf(event);
    const ui = useUiStore.getState();
    if (node.id.startsWith(SPEC_NODE_PREFIX)) {
      ui.select({ kind: 'specialization', id: node.id.slice(SPEC_NODE_PREFIX.length) });
      return;
    }
    ui.select({ kind: 'entity', id: node.id });
    ui.openContextMenu({ x, y, entityId: node.id });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();
      const { x, y } = pointOf(event);
      useUiStore.getState().openContextMenu({ x, y, flowPosition: screenToFlowPosition({ x, y }) });
    },
    [screenToFlowPosition],
  );

  const onSelectionChange = useCallback((_: OnSelectionChangeParams) => undefined, []);

  /**
   * Dragging from a table's connector onto another table (or itself) opens the relationship dialog.
   * Dragging from an attribute's handle creates a FK to that attribute right away.
   */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const fromId = state.fromNode?.id;
      const toId = state.toNode?.id ?? nodeIdAtPoint(event);
      if (!fromId || !toId || !project) return;
      const handle = state.fromHandle?.id ?? '';
      if (handle.startsWith(ATTR_HANDLE_PREFIX)) {
        linkAttributeAsFk(fromId, handle.slice(ATTR_HANDLE_PREFIX.length), toId);
        return;
      }
      const isRegular = (id: string) => project.entities.find((e) => e.id === id)?.kind === 'entity';
      if (!isRegular(fromId) || !isRegular(toId)) {
        useUiStore.getState().notify(t('canvas.onlyEntities'), 'error');
        return;
      }
      useUiStore.getState().openRelationshipDialog([fromId, toId]);
    },
    [project],
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onNodeDragStop,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
    onEdgeMouseEnter,
    onEdgeMouseLeave,
    onSelectionChange,
    onConnectEnd,
    onNodeContextMenu,
    onPaneContextMenu,
  };
};

export default useDiagramGraph;
