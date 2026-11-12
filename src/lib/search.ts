/** Lowercase text without accents, so "Lexend" matches "lexénd" and "Ciudad" matches "ciudád". */
export const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** True when every word of the query appears in any of the fields. */
export const matchesQuery = (query: string, ...fields: string[]) => {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(fields.join(' '));
  return words.every((word) => haystack.includes(word));
};
