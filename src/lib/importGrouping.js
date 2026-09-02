import { mapImportedHeaders, shipmentMatchKeys } from './importer.js';

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toUpperCase();

const DETAIL_HEADER_NAMES = new Set([
  'FORWARDER', 'STATUS', 'CONTAINER NO.', 'CONTAINER NO', 'CONTAINER NUMBER',
  'MATERIAL', 'MATERIAL NO.', 'MATERIAL NUMBER', 'SKU', 'ITEM', 'ITEM CODE',
  'DESCRIPTION', 'QTY', 'QUANTITY', 'UOM', 'UNIT', 'INVOICE', 'INVOICE NO.',
  'INVOICE NUMBER', 'PO', 'PO NO.', 'PO NUMBER', 'SHIPPER', 'CUSTOMER', 'MODE',
  'PACKAGE', 'PACKAGES', 'NO. OF PACKAGES', 'ORIGIN', 'VESSEL', 'VESSEL / FLIGHT'
]);

const IDENTITY_FIELDS = new Set(['job_file_number', 'entry_no', 'house_awb_bl', 'master_awb_bl']);

function rowMappingScore(row) {
  const headers = (Array.isArray(row) ? row : []).map((value) => String(value ?? '').trim());
  const mapping = mapImportedHeaders(headers);
  const mappedFields = mapping.columns.filter((column) => !column.isCustom).map((column) => column.field);
  const mappedCount = mappedFields.length;
  const detailCount = headers.filter((value) => DETAIL_HEADER_NAMES.has(normalizeHeader(value))).length;
  const hasIdentity = mappedFields.some((field) => IDENTITY_FIELDS.has(field));
  const nonBlank = headers.filter((value) => value !== '').length;
  const density = nonBlank / Math.max(1, headers.length);
  const recognized = mappedCount + detailCount;
  return { recognized, hasIdentity, score: (recognized * 10) + Math.round(density * 5) + (hasIdentity ? 20 : 0) };
}

export function detectHeaderRow(matrix = [], { scanLimit = 50 } = {}) {
  let best = null;
  let seenNonEmpty = 0;
  for (let index = 0; index < matrix.length && seenNonEmpty < scanLimit; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    if (!row.some((value) => String(value ?? '').trim() !== '')) continue;
    seenNonEmpty += 1;
    const candidate = rowMappingScore(row);
    if (!candidate.hasIdentity || candidate.recognized < 3) continue;
    if (!best || candidate.score > best.score) {
      best = { headerIndex: index, headers: row.map((value) => String(value ?? '').trim()), score: candidate.score };
    }
  }
  if (!best) throw new Error('No credible shipment header row was found in this sheet.');
  return best;
}

function isSectionMarker(row, headers) {
  const values = headers.map((_, index) => row?.[index] ?? '');
  const nonBlank = values.map((value, index) => ({ value: String(value ?? '').trim(), index })).filter((item) => item.value !== '');
  if (nonBlank.length !== 1) return '';
  const text = nonBlank[0].value;
  if (!/[A-Za-z]/.test(text)) return '';
  const mapped = Object.fromEntries(headers.map((header, index) => [header, row?.[index] ?? '']));
  const mapping = mapImportedHeaders(headers);
  const normalized = {};
  for (const column of mapping.columns) normalized[column.field] = mapped[column.originalHeader];
  if (shipmentMatchKeys(normalized).length) return '';
  return text;
}

function looksLikeRepeatedHeader(row, headers) {
  const normalizedRow = headers.map((_, index) => normalizeHeader(row?.[index]));
  const normalizedHeaders = headers.map(normalizeHeader);
  let same = 0;
  let compared = 0;
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    if (!normalizedHeaders[index]) continue;
    compared += 1;
    if (normalizedRow[index] === normalizedHeaders[index]) same += 1;
  }
  return compared >= 3 && same / compared >= 0.6;
}

export function parseSheetRows(matrix = [], sheetName = '') {
  const detected = detectHeaderRow(matrix);
  const headers = detected.headers;
  const rows = [];
  let sourceSection = '';
  for (let index = detected.headerIndex + 1; index < matrix.length; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    if (!row.some((value) => String(value ?? '').trim() !== '')) continue;
    const section = isSectionMarker(row, headers);
    if (section) { sourceSection = section; continue; }
    if (looksLikeRepeatedHeader(row, headers)) continue;
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] ?? '']));
    rows.push({ raw, sourceSheet: sheetName, sourceRowNumber: index + 1, sourceSection });
  }
  return { headers, rows, headerIndex: detected.headerIndex };
}

const DETAIL_ONLY_FIELDS = new Set([
  'custom__container_no', 'custom__container_number',
  'custom__invoice', 'custom__invoice_no', 'custom__invoice_number',
  'custom__po', 'custom__po_no', 'custom__po_number',
  'custom__material', 'custom__material_no', 'custom__material_number', 'custom__sku',
  'description', 'custom__qty', 'custom__quantity', 'custom__uom', 'custom__unit'
]);

function isBlank(value) { return value === undefined || value === null || String(value).trim() === ''; }
function normalizeDetailValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}
function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
function rawHeaderValue(raw, names) {
  const wanted = new Set(names.map(normalizeHeader));
  for (const [header, value] of Object.entries(raw || {})) {
    if (wanted.has(normalizeHeader(header)) && !isBlank(value)) return value;
  }
  return '';
}
function normalizedDetailFields(raw = {}) {
  const fields = {
    container_number: rawHeaderValue(raw, ['CONTAINER NO.', 'CONTAINER NO', 'CONTAINER NUMBER']),
    invoice_number: rawHeaderValue(raw, ['INVOICE', 'INVOICE NO.', 'INVOICE NO', 'INVOICE NUMBER']),
    po_number: rawHeaderValue(raw, ['PO', 'PO NO.', 'PO NO', 'PO NUMBER']),
    material: rawHeaderValue(raw, ['MATERIAL', 'MATERIAL NO.', 'MATERIAL NO', 'MATERIAL NUMBER', 'SKU', 'ITEM', 'ITEM CODE']),
    description: rawHeaderValue(raw, ['DESCRIPTION']),
    quantity: rawHeaderValue(raw, ['QTY', 'QUANTITY']),
    uom: rawHeaderValue(raw, ['UOM', 'UNIT'])
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => !isBlank(value)).map(([key, value]) => [key, normalizeDetailValue(value)]));
}
function orderedHeadersForRow(raw, headers) {
  const order = [];
  const seen = new Set();
  for (const header of headers || []) {
    if (!Object.prototype.hasOwnProperty.call(raw || {}, header) || seen.has(header)) continue;
    seen.add(header); order.push(header);
  }
  for (const header of Object.keys(raw || {})) { if (!seen.has(header)) { seen.add(header); order.push(header); } }
  return order;
}
function rawCellsForRow(raw, headers) { return orderedHeadersForRow(raw, headers).map((header) => ({ header, value: raw?.[header] ?? '' })); }
function mapSourceRow(raw, mapping, assignedTo = '') {
  const mapped = {};
  if (assignedTo) { mapped.assigned_to = assignedTo; mapped.customs_declarant = assignedTo; }
  for (const column of mapping.columns || []) {
    if (Object.prototype.hasOwnProperty.call(raw || {}, column.originalHeader)) mapped[column.field] = raw[column.originalHeader];
  }
  return mapped;
}
function shipmentCodeHint(mapped, groupKey) {
  return mapped.job_file_number || mapped.entry_no || mapped.house_awb_bl || mapped.master_awb_bl || String(groupKey || '').split(':').slice(1).join(':');
}

export function buildDetailLine(sourceRow, mappedRow, occurrence = 1, headers = []) {
  const raw = sourceRow?.raw || {};
  const normalized_fields = normalizedDetailFields(raw);
  const raw_cells = rawCellsForRow(raw, headers);
  const preferredIdentity = [
    sourceRow?.sourceSheet || '', normalized_fields.container_number || '', normalized_fields.invoice_number || '',
    normalized_fields.po_number || '', normalized_fields.material || '', normalized_fields.description || '',
    normalized_fields.quantity || '', normalized_fields.uom || ''
  ].map(normalizeDetailValue);
  const hasPreferredIdentity = preferredIdentity.slice(1).some(Boolean);
  const fallbackIdentity = raw_cells.filter((cell) => !isBlank(cell.value)).map((cell) => `${normalizeHeader(cell.header)}=${normalizeDetailValue(cell.value)}`);
  const identityParts = hasPreferredIdentity ? preferredIdentity : [sourceRow?.sourceSheet || '', ...fallbackIdentity];
  const base = stableHash(JSON.stringify(identityParts));
  return {
    line_key: `${base}:${occurrence}`,
    source_sheet: sourceRow?.sourceSheet || '',
    source_row_number: Number(sourceRow?.sourceRowNumber) || null,
    source_section: sourceRow?.sourceSection || '',
    raw_cells,
    normalized_fields,
    _mapped: mappedRow
  };
}

export function groupImportedShipmentRows(sourceRows = [], headers = [], assignedTo = '') {
  const mapping = mapImportedHeaders(headers);
  const groupsByKey = new Map();
  for (const sourceRow of sourceRows || []) {
    const mapped = mapSourceRow(sourceRow?.raw || {}, mapping, assignedTo);
    const keys = shipmentMatchKeys(mapped);
    if (!keys.length) continue;
    const groupKey = keys[0];
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        groupKey, shipmentCodeHint: shipmentCodeHint(mapped, groupKey), masterRow: {}, details: [], masterConflicts: [], sourceSheets: [],
        _conflictsByField: new Map(), _detailOccurrences: new Map()
      });
    }
    const group = groupsByKey.get(groupKey);
    if (sourceRow?.sourceSheet && !group.sourceSheets.includes(sourceRow.sourceSheet)) group.sourceSheets.push(sourceRow.sourceSheet);
    for (const [field, value] of Object.entries(mapped)) {
      if (DETAIL_ONLY_FIELDS.has(field) || isBlank(value)) continue;
      const current = group.masterRow[field];
      if (isBlank(current)) { group.masterRow[field] = value; continue; }
      if (normalizeDetailValue(current) === normalizeDetailValue(value)) continue;
      let conflict = group._conflictsByField.get(field);
      if (!conflict) {
        conflict = { id: `${groupKey}:master:${field}`, field, label: mapping.columns.find((column) => column.field === field)?.label || field, values: [current] };
        group._conflictsByField.set(field, conflict); group.masterConflicts.push(conflict);
      }
      if (!conflict.values.some((existing) => normalizeDetailValue(existing) === normalizeDetailValue(value))) conflict.values.push(value);
    }
    const preliminary = buildDetailLine(sourceRow, mapped, 1, headers);
    const baseKey = preliminary.line_key.replace(/:\d+$/, '');
    const occurrence = (group._detailOccurrences.get(baseKey) || 0) + 1;
    group._detailOccurrences.set(baseKey, occurrence);
    group.details.push({ ...preliminary, line_key: `${baseKey}:${occurrence}` });
  }
  return [...groupsByKey.values()].map((group) => {
    const { _conflictsByField, _detailOccurrences, ...clean } = group;
    clean.details = clean.details.map(({ _mapped, ...detail }) => detail);
    return clean;
  });
}
