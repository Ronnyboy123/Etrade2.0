const EMPTY_PLACEHOLDERS = new Set([
  'N/A',
  'NA',
  'N.A.',
  'NONE',
  'NOT APPLICABLE',
  '-',
  '—',
  '.',
  '..',
  '...',
  'TBA',
  'TBD',
  'NIL'
]);

export function isBlankLike(value) {
  if (value === undefined || value === null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return EMPTY_PLACEHOLDERS.has(text.toUpperCase());
}
