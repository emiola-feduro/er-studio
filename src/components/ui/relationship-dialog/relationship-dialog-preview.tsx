import useT from '../../../hooks/ui/use-t';
import type { RelationshipPreset } from '../../../domain/model';
import type { Entity } from '../../../domain/types';

type RelationshipDialogPreviewProps = {
  ids: string[];
  preset: RelationshipPreset;
  recursive: boolean;
  entities: Entity[];
};

/** Plain-language summary of what will be generated, so the result is never a surprise. */
const RelationshipDialogPreview = ({ ids, preset, recursive, entities }: RelationshipDialogPreviewProps) => {
  const t = useT();
  const names = ids.map((id) => entities.find((e) => e.id === id)?.name ?? '?');
  let text: string;
  if (ids.length > 2) {
    text = t('relDialog.preview.nary', { name: names.join('_') });
  } else if (recursive) {
    text =
      preset === 'N:M'
        ? t('relDialog.preview.recursiveNM', { a: names[0] })
        : t('relDialog.preview.recursive', { a: names[0] });
  } else if (preset === 'N:M') {
    text = t('relDialog.preview.nm', { a: names[0], b: names[1] });
  } else if (preset === '1:1') {
    text = t('relDialog.preview.oneToOne', { a: names[0], b: names[1] });
  } else {
    text = t('relDialog.preview.oneToMany', { a: names[0], b: names[1] });
  }
  return <p className="rounded-theme bg-surface-2 px-3 py-2.5 leading-relaxed">{text}</p>;
};

export default RelationshipDialogPreview;
