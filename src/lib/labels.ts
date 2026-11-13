import type { RelationshipKind } from '../domain/model';
import type { MessageKey } from '../i18n';

/** Message keys for the domain's relationship kinds. */
export const RELATIONSHIP_KIND_KEYS: Record<RelationshipKind, MessageKey> = {
  binaria: 'relKind.binary',
  recursiva: 'relKind.recursive',
  ternaria: 'relKind.ternary',
  'n-aria': 'relKind.nary',
};

export const RELATIONSHIP_TITLE_KEYS: Record<RelationshipKind, MessageKey> = {
  binaria: 'relTitle.binary',
  recursiva: 'relTitle.recursive',
  ternaria: 'relTitle.ternary',
  'n-aria': 'relTitle.nary',
};

/** Type groups as the dialect catalog names them, mapped to message keys. */
export const TYPE_GROUP_KEYS: Record<string, MessageKey> = {
  Numéricos: 'typeGroup.numeric',
  Texto: 'typeGroup.text',
  'Fecha y hora': 'typeGroup.datetime',
  Binarios: 'typeGroup.binary',
  Otros: 'typeGroup.other',
};
