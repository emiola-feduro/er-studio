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
  const names = ids.map((id) => entities.find((e) => e.id === id)?.name ?? '?');
  let text: string;
  if (ids.length > 2) {
    text = `Se creará la tabla intermedia ${names.join('_')} con una FK hacia cada entidad. Su PK será la combinación de esas FKs.`;
  } else if (recursive) {
    text =
      preset === 'N:M'
        ? `Relación recursiva N:M: se creará una tabla intermedia con dos FKs hacia ${names[0]}. Ponle un rol a cada lado (por ejemplo seguidor y seguido).`
        : `Relación recursiva: ${names[0]} tendrá una FK hacia sí misma. Ponle un rol a cada lado (por ejemplo jefe y subordinado).`;
  } else if (preset === 'N:M') {
    text = `Se creará la tabla intermedia ${names[0]}_${names[1]} con PK compuesta (${names[0]}_id, ${names[1]}_id).`;
  } else if (preset === '1:1') {
    text = `${names[1]} recibirá la FK ${names[0]}_id con restricción UNIQUE.`;
  } else {
    text = `${names[1]} recibirá la FK ${names[0]}_id. Un ${names[0]} tiene muchos ${names[1]}.`;
  }
  return <p className="rounded-theme bg-surface-2 px-3 py-2.5 leading-relaxed">{text}</p>;
};

export default RelationshipDialogPreview;
