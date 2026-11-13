import { useReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import type { MenuItem } from '../../components/ui/menu/menu-list';
import { addAttribute, addEntity, addRandomRows, deleteEntity, duplicateEntity } from '../../lib/actions';
import useProjectStore from '../../stores/use-project-store';
import useUiStore, { type ContextMenuState } from '../../stores/use-ui-store';
import usePanels from '../ui/use-panels';
import useT from '../ui/use-t';
import useAutoLayout from './use-auto-layout';
import useExportImage from './use-export-image';

const RANDOM_ROWS = 10;

/** Items of the canvas right-click menu: one set for a table, another for the empty canvas. */
const useCanvasContextMenu = (menu: ContextMenuState | null) => {
  const entity = useProjectStore((s) => (menu?.entityId ? s.project?.entities.find((e) => e.id === menu.entityId) : undefined));
  const { setVisible, isVisible, focusMode, setFocusMode } = usePanels();
  const autoLayout = useAutoLayout();
  const t = useT();
  const exportImage = useExportImage();
  const { fitView } = useReactFlow();

  return useMemo((): { label: string; items: MenuItem[] } | null => {
    if (!menu) return null;
    const ui = useUiStore.getState();

    const edit = () => {
      if (!entity) return;
      ui.select({ kind: 'entity', id: entity.id });
      if (!isVisible('inspector')) setVisible('inspector', true);
    };
    const showRecords = () => {
      if (!entity) return;
      if (focusMode) setFocusMode(false);
      ui.select({ kind: 'entity', id: entity.id });
      ui.setRecordsTable(entity.id);
      ui.setView('records');
    };

    if (menu.entityId) {
      if (!entity) return null;
      const { id, name, kind } = entity;
      const isJunction = kind === 'junction';
      return {
        label: t('canvas.entityActions', { name }),
        items: [
          { label: t('canvas.edit'), onSelect: edit },
          {
            label: t('entity.addAttribute'),
            onSelect: () => {
              addAttribute(id);
              edit();
            },
          },
          ...(isJunction ? [] : [{ label: t('canvas.relateTo'), onSelect: () => ui.openRelationshipDialog([id]) }]),
          { label: t('canvas.viewRecords'), onSelect: showRecords, separatorBefore: true },
          { label: t('agentExport.contextMenu'), onSelect: () => ui.openAgentExport(id) },
          {
            label: t('canvas.generateRows', { count: RANDOM_ROWS }),
            onSelect: () => {
              if (addRandomRows(id, RANDOM_ROWS) === RANDOM_ROWS) ui.notify(t('canvas.rowsAdded', { count: RANDOM_ROWS, name }));
            },
          },
          ...(isJunction ? [] : [{ label: t('common.duplicate'), onSelect: () => duplicateEntity(id), separatorBefore: true }]),
          {
            label: isJunction ? t('canvas.deleteRelationship') : t('common.delete'),
            danger: true,
            separatorBefore: isJunction,
            hint: t('inspector.shortcut.deleteKey'),
            onSelect: () => deleteEntity(id),
          },
        ],
      };
    }

    return {
      label: t('canvas.diagramActions'),
      items: [
        { label: t('canvas.newEntityHere'), hint: 'E', onSelect: () => addEntity(menu.flowPosition) },
        { label: t('canvas.newRelationship'), onSelect: () => ui.openRelationshipDialog() },
        { label: t('canvas.arrangeDiagram'), onSelect: autoLayout, separatorBefore: true },
        { label: t('canvas.fitView'), onSelect: () => void fitView({ padding: 0.15, duration: 250 }) },
        { label: t('export.copyPng'), onSelect: () => void exportImage('copy-png') },
        { label: t('panels.focus'), hint: 'F', checked: focusMode, onSelect: () => setFocusMode(!focusMode), separatorBefore: true },
      ],
    };
  }, [menu, entity, isVisible, setVisible, focusMode, setFocusMode, autoLayout, fitView, exportImage, t]);
};

export default useCanvasContextMenu;
