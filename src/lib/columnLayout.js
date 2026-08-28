import { FIELD_DEFINITIONS } from './importer.js';

export const GROUP_META = {
  auto: { label: 'Automated Status & Action', className: 'group-auto' },
  shipment: { label: 'CTQO / Shipment Details', className: 'group-shipment' },
  customs: { label: 'Customs Declarant', className: 'group-customs' },
  portal: { label: 'Broker / Portal', className: 'group-portal' },
  biller: { label: 'Assistant Biller', className: 'group-biller' },
  timeline: { label: 'Timeline Performance', className: 'group-timeline' },
  imported: { label: 'Imported Fields', className: 'group-imported' }
};

function toMetaMap(columnMeta = []) {
  if (columnMeta instanceof Map) return columnMeta;
  return new Map((columnMeta || []).map((column) => [column.field, column]));
}

export function getFieldGroup(field, columnMeta = []) {
  if (FIELD_DEFINITIONS[field]) return FIELD_DEFINITIONS[field].group ?? 'imported';
  const meta = toMetaMap(columnMeta).get(field);
  return meta?.group ?? 'imported';
}

export function buildDisplaySegments(fields = [], columnMeta = []) {
  const segments = [];
  const meta = toMetaMap(columnMeta);

  for (const field of fields) {
    const group = getFieldGroup(field, meta);
    const previous = segments.at(-1);

    if (previous && previous.group === group) {
      previous.fields.push(field);
    } else {
      segments.push({ group, fields: [field] });
    }
  }

  return segments;
}
