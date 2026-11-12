import { useReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import type { MenuItem } from '../../components/ui/menu/menu-list';
import { addAttribute, addEntity, addRandomRows, deleteEntity, duplicateEntity } from '../../lib/actions';
import useProjectStore from '../../stores/use-project-store';
import useUiStore, { type ContextMenuState } from '../../stores/use-ui-store';
import usePanels from '../ui/use-panels';
import useAutoLayout from './use-auto-layout';

const RANDOM_ROWS = 10;

/** Items of the canvas right-click menu: one set for a table, another for the empty canvas. */
const useCanvasContextMenu = (menu: ContextMenuState | null) => {
  const entity = useProjectStore((s) => (menu?.entityId ? s.project?.entities.find((e) => e.id === menu.entityId) : undefined));
  const { setVisible, isVisible, focusMode, setFocusMode } = usePanels();
  const autoLayout = useAutoLayout();
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
        label: `Acciones de ${name}`,
        items: [
          { label: 'Editar', onSelect: edit },
          {
            label: 'Añadir atributo',
            onSelect: () => {
              addAttribute(id);
              edit();
            },
          },
          ...(isJunction ? [] : [{ label: 'Relacionar con otra entidad', onSelect: () => ui.openRelationshipDialog([id]) }]),
          { label: 'Ver registros', onSelect: showRecords, separatorBefore: true },
          {
            label: `Generar ${RANDOM_ROWS} registros aleatorios`,
            onSelect: () => {
              if (addRandomRows(id, RANDOM_ROWS) === RANDOM_ROWS) ui.notify(`${RANDOM_ROWS} registros añadidos a ${name}.`);
            },
          },
          ...(isJunction ? [] : [{ label: 'Duplicar', onSelect: () => duplicateEntity(id), separatorBefore: true }]),
          {
            label: isJunction ? 'Eliminar relación' : 'Eliminar',
            danger: true,
            separatorBefore: isJunction,
            hint: 'Supr',
            onSelect: () => deleteEntity(id),
          },
        ],
      };
    }

    return {
      label: 'Acciones del diagrama',
      items: [
        { label: 'Nueva entidad aquí', hint: 'E', onSelect: () => addEntity(menu.flowPosition) },
        { label: 'Nueva relación', onSelect: () => ui.openRelationshipDialog() },
        { label: 'Ordenar diagrama', onSelect: autoLayout, separatorBefore: true },
        { label: 'Ajustar vista', onSelect: () => void fitView({ padding: 0.15, duration: 250 }) },
        { label: 'Solo diagrama', hint: 'F', checked: focusMode, onSelect: () => setFocusMode(!focusMode), separatorBefore: true },
      ],
    };
  }, [menu, entity, isVisible, setVisible, focusMode, setFocusMode, autoLayout, fitView]);
};

export default useCanvasContextMenu;
