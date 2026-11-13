import useT from '../../../hooks/ui/use-t';
import type { Entity } from '../../../domain/types';
import { deleteEntity, duplicateEntity, renameEntity, resetJunctionName, updateEntity } from '../../../lib/actions';
import PanelHideButton from '../../ui/panel-hide-button/panel-hide-button';
import Button from '../../ui/button/button';

const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#99f6e4'];

const InspectorEntityHeader = ({ entity }: { entity: Entity }) => {
  const t = useT();
  const { id, name, kind, color, nameIsCustom } = entity;
  const isJunction = kind === 'junction';

  return (
    <div className="space-y-3 border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[1.15em] font-semibold">{isJunction ? t('entity.junctionTitle') : t('entity.title')}</h2>
        <div className="flex gap-1">
          {!isJunction && (
            <Button size="sm" variant="ghost" onClick={() => duplicateEntity(id)}>
              {t('common.duplicate')}
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => deleteEntity(id)}>
            {t('common.delete')}
          </Button>
          <PanelHideButton panel="inspector" />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`entity-name-${id}`} className="block font-medium">
          {t('entity.tableName')}
        </label>
        <input id={`entity-name-${id}`} className="field" value={name} onChange={(e) => renameEntity(id, e.target.value)} />
        {isJunction && nameIsCustom && (
          <button type="button" className="text-accent underline underline-offset-2" onClick={() => resetJunctionName(id)}>
            {t('entity.resetName')}
          </button>
        )}
      </div>
      {!isJunction && (
        <fieldset>
          <legend className="mb-1.5 font-medium">{t('entity.headerColor')}</legend>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={!color}
              onClick={() => updateEntity(id, { color: undefined })}
              className={`h-7 rounded-[calc(var(--radius)*0.5)] border-(length:--bw) px-2 text-[0.86em] ${!color ? 'border-accent outline-2 outline-accent' : 'border-line'}`}
            >
              {t('entity.themeColor')}
            </button>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t('entity.color', { color: c })}
                aria-pressed={color === c}
                onClick={() => updateEntity(id, { color: c })}
                className={`size-7 rounded-[calc(var(--radius)*0.5)] border-(length:--bw) border-line ${color === c ? 'outline-2 outline-offset-1 outline-accent' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};

export default InspectorEntityHeader;
