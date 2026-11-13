import { formatList } from '../../../i18n';
import usePreferencesStore from '../../../stores/use-preferences-store';
import useT from '../../../hooks/ui/use-t';
import { deleteEntity } from '../../../lib/actions';
import useProjectStore from '../../../stores/use-project-store';
import useUiStore from '../../../stores/use-ui-store';
import ConfirmDialog from '../confirm-dialog/confirm-dialog';

/** Asks before deleting an entity, saying what goes with it. */
const DeleteEntityDialog = () => {
  const t = useT();
  const entityId = useUiStore((s) => s.entityToDelete);
  const request = useUiStore((s) => s.requestDeleteEntity);
  const project = useProjectStore((s) => s.project);
  const locale = usePreferencesStore((s) => s.locale);
  const entity = project?.entities.find((e) => e.id === entityId);
  if (!project || !entity) return null;

  const { id, name, kind, attributes } = entity;
  const isJunction = kind === 'junction';
  const relationships = project.relationships.filter((r) => r.participants.some((p) => p.entityId === id)).length;
  const records = project.records?.[id]?.length ?? 0;
  const parts = [
    attributes.length > 0 && t('count.attributes', { count: attributes.length }),
    relationships > 0 && t('count.relationships', { count: relationships }),
    records > 0 && t('count.records', { count: records }),
  ].filter((part): part is string => Boolean(part));

  return (
    <ConfirmDialog
      open
      title={isJunction ? t('deleteEntity.titleJunction') : t('deleteEntity.title')}
      message={
        isJunction
          ? t('deleteEntity.messageJunction', { name, records })
          : t('deleteEntity.message', {
              name,
              // Only what the entity actually has: "con 3 atributos y 1 relación".
              details: parts.length ? t('deleteEntity.with', { list: formatList(parts, locale) }) : '',
            })
      }
      confirmLabel={isJunction ? t('deleteEntity.confirmJunction') : t('deleteEntity.confirm')}
      onCancel={() => request(null)}
      onConfirm={() => {
        request(null);
        deleteEntity(id);
      }}
    />
  );
};

export default DeleteEntityDialog;
