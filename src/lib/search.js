import { AUTOMATED_FIELDS, FIELD_DEFINITIONS } from './importer.js';

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[()/.\\_-]/g, ' ')
    .replace(/\b(billed|billing)\b/g, 'bill')
    .replace(/\b(lodged|lodgement)\b/g, 'lodge')
    .replace(/\b(assessed|assessment)\b/g, 'assess')
    .replace(/\b(released|releasing)\b/g, 'release')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSearchableColumns(layout = null) {
  const importedMeta = new Map((layout?.columns || []).map((column) => [column.field, column]));
  const standardFields = Object.keys(FIELD_DEFINITIONS).filter(
    (field) => !AUTOMATED_FIELDS.includes(field)
  );
  const visibleFields = layout?.displayOrder?.length ? layout.displayOrder : standardFields;
  const fields = [...AUTOMATED_FIELDS, ...visibleFields];
  const seen = new Set();

  return fields
    .filter((field) => {
      if (seen.has(field)) return false;
      seen.add(field);
      return true;
    })
    .map((field) => ({
      field,
      label: FIELD_DEFINITIONS[field]?.label || importedMeta.get(field)?.label || field
    }));
}

export function resolveSmartSearch(query, columns = []) {
  const raw = String(query ?? '').trim();
  const q = normalize(raw);
  if (!q) return { type: 'rows', query: '' };

  const normalized = columns.map((column) => ({
    ...column,
    normalizedLabel: normalize(column.label),
    normalizedField: normalize(column.field)
  }));

  const exact = normalized.find(
    (column) => column.normalizedLabel === q || column.normalizedField === q
  );
  if (exact) return { type: 'column', field: exact.field, label: exact.label };

  const partial = normalized.filter(
    (column) => column.normalizedLabel.includes(q) || q.includes(column.normalizedLabel)
  );

  if (partial.length === 1) {
    return { type: 'column', field: partial[0].field, label: partial[0].label };
  }

  return { type: 'rows', query: raw };
}
