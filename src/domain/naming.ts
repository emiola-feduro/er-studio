import type { Locale } from '../i18n';

/**
 * Singular form of a table name, used to name foreign keys (clientes → cliente_id). Rules per
 * language because plurals differ; only the last word of snake_case or camelCase names changes
 * (order_items → order_item). Names that already look singular stay as they are.
 */

type Rule = [RegExp, string];

const EN_IRREGULAR: Record<string, string> = {
  people: 'person',
  men: 'man',
  women: 'woman',
  children: 'child',
  mice: 'mouse',
  geese: 'goose',
  teeth: 'tooth',
  feet: 'foot',
  indices: 'index',
  matrices: 'matrix',
  criteria: 'criterion',
  phenomena: 'phenomenon',
  analyses: 'analysis',
  statuses: 'status',
  addresses: 'address',
  aliases: 'alias',
  buses: 'bus',
  quizzes: 'quiz',
};

const EN_INVARIANT = /^(data|media|news|series|species|equipment|information|metadata|sheep|fish|aircraft|software|staff|feedback|status|address|analysis|bus|alias|class|access|process|business|campus|virus|axis|basis|chassis)$/;

const EN_RULES: Rule[] = [
  [/([^aeiouy])ies$/, '$1y'], // categories → category
  [/(ss|sh|ch|x|zz)es$/, '$1'], // boxes, matches, glasses
  [/([^aeiou])oes$/, '$1o'], // heroes → hero
  [/(lea|loa|thie|shel|wol|hal|cal)ves$/, '$1f'], // leaves → leaf, wolves → wolf
  [/(kni|wi|li)ves$/, '$1fe'], // knives → knife
  [/([^su])s$/, '$1'], // orders → order (keeps -ss and -us)
];

const ES_RULES: Rule[] = [
  [/ces$/, 'z'], // luces → luz
  [/iones$/, 'ion'], // canciones → cancion (written without accents in identifiers)
  [/([aeiou])([dlnrjy])es$/, '$1$2'], // ciudades → ciudad, profesores → profesor, papeles → papel
  [/([aeiou])s$/, '$1'], // clientes → cliente, categorias → categoria
];

const PT_RULES: Rule[] = [
  [/(c|g)?oes$/, '$1ao'], // opcoes → opcao, botoes → botao
  [/aes$/, 'ao'], // paes → pao
  [/([aeiou])is$/, '$1l'], // animais → animal, papeis → papel
  [/ns$/, 'm'], // itens → item
  [/([aeiou])([rz])es$/, '$1$2'], // professores → professor
  [/([aeiou])s$/, '$1'], // clientes → cliente
];

const FR_INVARIANT = /^(cours|prix|pays|fois|temps|corps|bras|mois|poids|avis|choix|repas|fils|souris|virus|bus|campus|statut|status)$/;

const FR_RULES: Rule[] = [
  [/eaux$/, 'eau'], // bureaux → bureau
  [/aux$/, 'al'], // journaux → journal
  [/eux$/, 'eu'], // jeux → jeu
  [/([^s])s$/, '$1'], // clients → client
];

const RULES: Record<Locale, Rule[]> = { en: EN_RULES, es: ES_RULES, pt: PT_RULES, fr: FR_RULES };

const singularWord = (word: string, locale: Locale) => {
  const lower = word.toLowerCase();
  // Short words such as "mes" or "bus" are usually already singular.
  if (lower.length <= 3) return word;
  if (locale === 'en') {
    if (EN_IRREGULAR[lower]) return matchCase(word, EN_IRREGULAR[lower]);
    if (EN_INVARIANT.test(lower)) return word;
  }
  if (locale === 'fr' && FR_INVARIANT.test(lower)) return word;
  // Spanish and Portuguese words ending in -is/-us are singular (analisis, virus).
  if ((locale === 'es' || locale === 'pt') && /(is|us)$/.test(lower) && !(locale === 'pt' && /[aeiou]is$/.test(lower))) return word;
  for (const [pattern, replacement] of RULES[locale]) {
    if (pattern.test(lower)) return matchCase(word, lower.replace(pattern, replacement));
  }
  return word;
};

/** Keeps an all-caps word in caps; otherwise returns the lower case result. */
const matchCase = (original: string, result: string) => (original === original.toUpperCase() && /[A-Z]/.test(original) ? result.toUpperCase() : result);

export const singularize = (name: string, locale: Locale = 'es'): string => {
  const snake = /^(.*[_\-\s])([^_\-\s]+)$/.exec(name);
  if (snake) return `${snake[1]}${singularWord(snake[2], locale)}`;
  const camel = /^(.*[a-z0-9])([A-Z][a-z0-9]*)$/.exec(name);
  if (camel) {
    const last = singularWord(camel[2].toLowerCase(), locale);
    return `${camel[1]}${last[0].toUpperCase()}${last.slice(1)}`;
  }
  return singularWord(name, locale);
};
