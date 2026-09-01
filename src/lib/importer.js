import { applyAutomation } from './automation.js';
import { DATE_FIELDS, normalizeDateValue } from './dataApi.js';

export const AUTOMATED_FIELDS = [
  'current_stage',
  'completion',
  'next_action',
  'overall_status',
  'boc_status',
  'days_open',
  'last_milestone_date',
  'delay_action_remarks'
];

export const FIELD_DEFINITIONS = {
  validated_manifest_date: { label: 'Validated Manifest Date', group: 'customs' },
  current_stage: { label: 'Current Stage', group: 'auto' },
  completion: { label: 'Completion %', group: 'auto' },
  next_action: { label: 'Next Action', group: 'auto' },
  overall_status: { label: 'Timeline Status', group: 'auto' },
  boc_status: { label: 'BOC Status', group: 'auto' },
  days_open: { label: 'Days Open', group: 'auto' },
  last_milestone_date: { label: 'Last Milestone Date', group: 'auto' },
  delay_action_remarks: { label: 'Delay / Action Remarks', group: 'auto' },

  service_month: { label: 'Service Month', group: 'shipment' },
  job_file_number: { label: 'Job File No.', group: 'shipment' },
  customer: { label: 'Customer', group: 'shipment' },
  shipper: { label: 'Shipper', group: 'shipment' },
  mode: { label: 'Mode (Air / LCL / FCL)', group: 'shipment' },
  house_awb_bl: { label: 'House AWB / BL No.', group: 'shipment' },
  master_awb_bl: { label: 'Master AWB / BL No.', group: 'shipment' },
  pre_alert_shipping_documents: { label: 'Pre-Alert Documents', group: 'shipment' },
  eta: { label: 'ETA', group: 'shipment' },
  cw_air_cbm_lcl: { label: 'Chargeable Weight / CBM', group: 'shipment' },
  number_of_container: { label: 'No. of Containers', group: 'shipment' },
  description: { label: 'Description', group: 'shipment' },
  dt_computation: { label: 'DT Computation', group: 'shipment' },
  week_no: { label: 'Week No.', group: 'shipment' },
  fundcast: { label: 'Fundcast', group: 'shipment' },
  ata: { label: 'ATA', group: 'shipment' },
  port_of_entry: { label: 'Port of Entry', group: 'shipment' },

  location_of_goods: { label: 'Location of Goods', group: 'customs' },
  lodgement: { label: 'Lodgement Date', group: 'customs' },
  assessed: { label: 'Assessment Date', group: 'customs' },
  paid: { label: 'Payment Date', group: 'customs' },
  entry_no: { label: 'Entry No.', group: 'customs' },
  selectivity_color: { label: 'Selectivity Color', group: 'customs' },

  portal_submission: { label: 'Portal Submission Date', group: 'portal' },
  broker_representative: { label: 'Broker Representative', group: 'portal' },
  portal_ticket_efile: { label: 'Portal Ticket / eFile', group: 'portal' },
  releasing_date: { label: 'Release Date', group: 'portal' },
  liquidation_processor: { label: 'Liquidation Processor Date', group: 'portal' },
  liquidation_tl: { label: 'Liquidation TL Date', group: 'portal' },
  endorsement_to_biller: { label: 'Endorsed to Biller', group: 'portal' },
  team_leader: { label: 'Team Leader', group: 'portal' },
  customs_declarant: { label: 'Customs Declarant', group: 'portal' },

  received_folder: { label: 'Folder Received Date', group: 'biller' },
  billed_date: { label: 'Billing Date', group: 'biller' },
  efile: { label: 'eFile Status', group: 'biller' },
  dispatch: { label: 'Dispatch Date', group: 'biller' },

  timeline_duty_tax: { label: 'Duty & Tax Lead Time', group: 'timeline' },
  timeline_lodgement: { label: 'Lodgement Lead Time', group: 'timeline' },
  timeline_fan: { label: 'FAN Lead Time', group: 'timeline' },
  timeline_cargo_releasing: { label: 'Cargo Release Lead Time', group: 'timeline' },
  timeline_liquidation: { label: 'Liquidation Processing Time', group: 'timeline' },
  timeline_liquidation_tl: { label: 'Liquidation TL Time', group: 'timeline' },
  timeline_billing: { label: 'Billing Lead Time', group: 'timeline' },
  timeline_closing: { label: 'Closing Lead Time', group: 'timeline' }
};

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[()]/g, ' ')
    .replace(/[\/\\.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (value) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'column';

const ALIASES = {
  'validated manifest date': 'validated_manifest_date',
  'manifest validated date': 'validated_manifest_date',
  'validated date': 'validated_manifest_date',
  'current stage': 'current_stage',
  'stage': 'current_stage',
  'completion': 'completion',
  'completion %': 'completion',
  'completion percent': 'completion',
  'next action': 'next_action',
  'overall timeline status': 'overall_status',
  'timeline status': 'overall_status',
  'overall status': 'overall_status',
  'boc status': 'boc_status',
  'customs status': 'boc_status',
  'days open': 'days_open',
  'last milestone date': 'last_milestone_date',
  'delay action remarks': 'delay_action_remarks',
  'delay / action remarks': 'delay_action_remarks',
  'remarks': 'delay_action_remarks',

  'service month': 'service_month',
  'job file number': 'job_file_number',
  'job file no': 'job_file_number',
  'job file': 'job_file_number',
  'customer': 'customer',
  'client': 'customer',
  'shipper': 'shipper',
  'mode': 'mode',
  'mode air lcl fcl': 'mode',
  'house awb bl number': 'house_awb_bl',
  'house awb bl no': 'house_awb_bl',
  'house awb bl': 'house_awb_bl',
  'hawb': 'house_awb_bl',
  'hbl': 'house_awb_bl',
  'master awb bl number': 'master_awb_bl',
  'master awb bl no': 'master_awb_bl',
  'master awb bl': 'master_awb_bl',
  'mawb': 'master_awb_bl',
  'mbl': 'master_awb_bl',
  'pre alert shipping documents': 'pre_alert_shipping_documents',
  'pre alert documents': 'pre_alert_shipping_documents',
  'pre alert': 'pre_alert_shipping_documents',
  'eta': 'eta',
  'cw air cbm lcl': 'cw_air_cbm_lcl',
  'chargeable weight cbm': 'cw_air_cbm_lcl',
  'chargeable weight / cbm': 'cw_air_cbm_lcl',
  'number of container': 'number_of_container',
  'number of containers': 'number_of_container',
  'no of container': 'number_of_container',
  'no of containers': 'number_of_container',
  'description': 'description',
  'dt computation': 'dt_computation',
  'week no': 'week_no',
  'week number': 'week_no',
  'fundcast': 'fundcast',
  'ata': 'ata',
  'port of entry': 'port_of_entry',

  'location of goods': 'location_of_goods',
  'lodgement': 'lodgement',
  'lodgement date': 'lodgement',
  'assessed': 'assessed',
  'assessment': 'assessed',
  'assessment date': 'assessed',
  'paid': 'paid',
  'payment date': 'paid',
  'entry no': 'entry_no',
  'entry number': 'entry_no',
  'selectivity color': 'selectivity_color',

  'portal submission': 'portal_submission',
  'portal submission date': 'portal_submission',
  "broker's representative": 'broker_representative',
  'broker representative': 'broker_representative',
  'portal ticket efile': 'portal_ticket_efile',
  'portal ticket / efile': 'portal_ticket_efile',
  'releasing date': 'releasing_date',
  'release date': 'releasing_date',
  'liquidation processor': 'liquidation_processor',
  'liquidation processor date': 'liquidation_processor',
  'liquidation tl': 'liquidation_tl',
  'liquidation tl date': 'liquidation_tl',
  'liquidation team lead': 'liquidation_tl',
  'endorsement to biller': 'endorsement_to_biller',
  'endorsed to biller': 'endorsement_to_biller',
  'team leader': 'team_leader',
  'customs declarant': 'customs_declarant',

  'received folder': 'received_folder',
  'folder received date': 'received_folder',
  'billed date': 'billed_date',
  'billing date': 'billed_date',
  'efile': 'efile',
  'efile status': 'efile',
  'dispatch': 'dispatch',
  'dispatch date': 'dispatch',

  'duty and tax computation': 'timeline_duty_tax',
  'duty tax lead time': 'timeline_duty_tax',
  'lodgement lead time': 'timeline_lodgement',
  'fan lead time': 'timeline_fan',
  'cargo releasing': 'timeline_cargo_releasing',
  'cargo release lead time': 'timeline_cargo_releasing',
  'liquidation release to processor': 'timeline_liquidation',
  'liquidation processing time': 'timeline_liquidation',
  'liquidation tl to biller': 'timeline_liquidation_tl',
  'liquidation tl time': 'timeline_liquidation_tl',
  'billing lead time': 'timeline_billing',
  'closing lead time': 'timeline_closing'
};

for (const [field, def] of Object.entries(FIELD_DEFINITIONS)) {
  ALIASES[normalize(def.label)] = field;
}

export const IMPORT_SOURCE_SHEET_FIELD = '__relora_source_sheet';

function sheetMatrixToRows(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const width = Math.max(0, ...matrix.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (width === 0) return { headers: [], rows: [] };

  const rawHeaders = Array.from({ length: width }, (_, index) => matrix[0]?.[index] ?? '');
  const headers = rawHeaders.map((value, index) => {
    const text = String(value ?? '').trim();
    return text || `Unnamed Column ${index + 1}`;
  });

  const rows = matrix
    .slice(1)
    .filter((row) => Array.isArray(row) && row.some((value) => String(value ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));

  return { headers, rows };
}

export function extractWorkbookSheets(workbook, sheetToMatrix) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!names.length) return [];
  if (typeof sheetToMatrix !== 'function') {
    throw new Error('A worksheet reader is required.');
  }

  return names.map((name) => {
    const worksheet = workbook?.Sheets?.[name];
    const matrix = worksheet ? sheetToMatrix(worksheet, name) : [];
    const parsed = sheetMatrixToRows(matrix);
    return {
      name,
      headers: parsed.headers,
      rows: parsed.rows,
      rowCount: parsed.rows.length,
      isEmpty: parsed.rows.length === 0
    };
  });
}

export function combineWorkbookSheets(sheets = [], selectedNames = []) {
  const selected = new Set(selectedNames);
  const chosenSheets = sheets.filter((sheet) => selected.has(sheet.name));
  const headers = [];
  const canonicalHeaderByKey = new Map();
  const rows = [];
  const sheetBreakdown = [];

  for (const sheet of chosenSheets) {
    for (const header of sheet.headers || []) {
      const key = String(header ?? '').trim().toLowerCase();
      if (canonicalHeaderByKey.has(key)) continue;
      canonicalHeaderByKey.set(key, header);
      headers.push(header);
    }
  }

  for (const sheet of chosenSheets) {
    const sheetRows = Array.isArray(sheet.rows) ? sheet.rows : [];
    sheetBreakdown.push({ name: sheet.name, rowCount: sheetRows.length });

    for (const row of sheetRows) {
      const normalizedRow = {};
      for (const header of sheet.headers || []) {
        if (!Object.prototype.hasOwnProperty.call(row, header)) continue;
        const key = String(header ?? '').trim().toLowerCase();
        const canonicalHeader = canonicalHeaderByKey.get(key) || header;
        normalizedRow[canonicalHeader] = row[header];
      }
      rows.push({ ...normalizedRow, [IMPORT_SOURCE_SHEET_FIELD]: sheet.name });
    }
  }

  return { headers, rows, sheetBreakdown };
}

export function mapImportedHeaders(headers) {
  const usedCustom = new Set();
  const columns = headers.map((header) => {
    const key = normalize(header);
    const knownField = ALIASES[key];
    if (knownField) {
      return {
        originalHeader: header,
        field: knownField,
        label: FIELD_DEFINITIONS[knownField]?.label ?? String(header),
        group: FIELD_DEFINITIONS[knownField]?.group ?? 'imported',
        isCustom: false
      };
    }

    let customField = `custom__${slug(header)}`;
    let index = 2;
    while (usedCustom.has(customField)) {
      customField = `custom__${slug(header)}_${index++}`;
    }
    usedCustom.add(customField);

    return {
      originalHeader: header,
      field: customField,
      label: String(header).trim() || 'Imported Column',
      group: 'imported',
      isCustom: true
    };
  });

  // Custom/unknown imported columns inherit the closest recognized section
  // so they visually stay with the part of the spreadsheet where they appeared.
  // Automatic fields are intentionally ignored as anchors because that section is
  // generated by the website and always displayed separately at the front.
  columns.forEach((column, columnIndex) => {
    if (!column.isCustom) return;

    let left = null;
    let right = null;

    for (let index = columnIndex - 1; index >= 0; index -= 1) {
      const candidate = columns[index];
      if (!candidate.isCustom && candidate.group !== 'auto') {
        left = { group: candidate.group, distance: columnIndex - index };
        break;
      }
    }

    for (let index = columnIndex + 1; index < columns.length; index += 1) {
      const candidate = columns[index];
      if (!candidate.isCustom && candidate.group !== 'auto') {
        right = { group: candidate.group, distance: index - columnIndex };
        break;
      }
    }

    if (left && right) {
      column.group = left.distance <= right.distance ? left.group : right.group;
    } else if (left) {
      column.group = left.group;
    } else if (right) {
      column.group = right.group;
    }
  });

  const displayOrder = columns
    .map((column) => column.field)
    .filter((field) => !AUTOMATED_FIELDS.includes(field));

  return { columns, displayOrder };
}

function normalizeMatchValue(value) {
  return String(value ?? '').trim().toUpperCase();
}

const GENERIC_MATCH_VALUES = new Set(['TBA', 'TBD', 'N/A', 'NA', 'NONE', '-']);

function usefulMatchValue(value) {
  const normalized = normalizeMatchValue(value);
  return normalized && !GENERIC_MATCH_VALUES.has(normalized) ? normalized : '';
}

export function shipmentMatchKeys(row) {
  const job = usefulMatchValue(row.job_file_number);
  const entry = usefulMatchValue(row.entry_no);
  const house = usefulMatchValue(row.house_awb_bl);
  const master = usefulMatchValue(row.master_awb_bl);

  // Match by the strongest identifiers first. A Master BL can be shared by
  // multiple House BLs, so it is only safe as a fallback when no stronger
  // identifier exists on the row.
  const keys = [
    job && `job:${job}`,
    entry && `entry:${entry}`,
    house && `house:${house}`
  ].filter(Boolean);

  if (!keys.length && master) keys.push(`master:${master}`);
  return keys;
}

function makeImportedRow(rawRow, columns, assignedTo, index) {
  const mapped = {
    id: `SHP-IMPORT-${Date.now()}-${index}`,
    assigned_to: assignedTo,
    customs_declarant: assignedTo
  };

  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(rawRow, column.originalHeader)) {
      mapped[column.field] = rawRow[column.originalHeader];
    }
  }

  if (!mapped.customs_declarant) mapped.customs_declarant = assignedTo;
  return mapped;
}

const WORKFLOW_STATUS_RANK = {
  PENDING: 0,
  REGISTERED: 1,
  ASSESSED: 2,
  PAID: 3,
  RELEASED: 4,
  EXPORT: 5
};

function parseTimestamp(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isBlankImportedValue(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function valuesEquivalent(field, serverValue, importedValue, row = {}) {
  if (String(serverValue ?? '') === String(importedValue ?? '')) return true;

  const shouldCompareAsDate = DATE_FIELDS.has(field)
    || serverValue instanceof Date
    || importedValue instanceof Date;

  if (!shouldCompareAsDate) return false;

  const serverDate = normalizeDateValue(serverValue, row);
  const importedDate = normalizeDateValue(importedValue, row);
  return Boolean(serverDate && importedDate && serverDate === importedDate);
}

function isWorkflowRegression(field, serverValue, importedValue) {
  if (field !== 'boc_status') return false;
  const serverRank = WORKFLOW_STATUS_RANK[String(serverValue ?? '').trim().toUpperCase()];
  const importRank = WORKFLOW_STATUS_RANK[String(importedValue ?? '').trim().toUpperCase()];
  return Number.isFinite(serverRank) && Number.isFinite(importRank) && importRank < serverRank;
}

function conflictIdFor(rowId, field) {
  return `${rowId}:${field}`;
}

export function buildImportPlan({
  existingRows,
  importedRows,
  headers,
  assignedTo = '',
  importSnapshotAt = null,
  sheetBreakdown = []
}) {
  const mapping = mapImportedHeaders(headers);
  const existingByKey = new Map();
  const importSnapshotTime = parseTimestamp(importSnapshotAt);

  for (const row of existingRows) {
    for (const key of shipmentMatchKeys(row)) {
      if (!existingByKey.has(key)) existingByKey.set(key, row.id);
    }
  }

  const nextRows = [...existingRows];
  const createdRows = [];
  const rowIndexById = new Map(nextRows.map((row, index) => [row.id, index]));
  const seenImportKeys = new Set();
  const changes = [];
  const fieldConflicts = [];
  const archivedConflicts = [];
  const rowTrace = [];
  let created = 0;
  let updated = 0;
  let duplicates = 0;
  let missingKey = 0;
  let conflicts = 0;
  let safeUpdates = 0;
  let unchanged = 0;
  let archivedMatches = 0;

  importedRows.forEach((rawRow, index) => {
    const sourceSheet = String(rawRow?.[IMPORT_SOURCE_SHEET_FIELD] ?? '').trim();
    const incoming = makeImportedRow(rawRow, mapping.columns, assignedTo, index);
    const traceBase = {
      sourceSheet,
      shipmentCode: incoming.job_file_number || incoming.entry_no || incoming.house_awb_bl || incoming.master_awb_bl || ''
    };
    const keys = shipmentMatchKeys(incoming);

    if (keys.length === 0) missingKey += 1;

    const duplicateWithinFile = keys.some((key) => seenImportKeys.has(key));
    if (duplicateWithinFile) {
      duplicates += 1;
      rowTrace.push({ ...traceBase, result: 'Duplicate in selected sheets' });
      return;
    }
    keys.forEach((key) => seenImportKeys.add(key));

    const existingId = keys.map((key) => existingByKey.get(key)).find(Boolean);

    if (existingId) {
      const rowIndex = rowIndexById.get(existingId);
      const oldRow = nextRows[rowIndex];

      if (assignedTo && oldRow.assigned_to && oldRow.assigned_to !== assignedTo) {
        conflicts += 1;
        changes.push({ type: 'conflict', row: oldRow, incoming, sourceSheet });
        rowTrace.push({ ...traceBase, result: 'Skipped - another employee' });
        return;
      }

      if (oldRow.archived_at) {
        const archivedConflict = {
          id: `archived:${oldRow.id}`,
          shipmentId: oldRow.id,
          shipmentCode: oldRow.shipment_code || oldRow.job_file_number || '',
          reason: 'Archived shipment already exists in Relora. Skip it, or explicitly Restore & Update it from this import.',
          sourceSheet
        };
        archivedMatches += 1;
        archivedConflicts.push(archivedConflict);
        changes.push({
          type: 'archived_match',
          row: oldRow,
          incoming,
          archivedConflictId: archivedConflict.id,
          changedFields: [],
          fieldConflicts: [],
          sourceSheet
        });
        rowTrace.push({ ...traceBase, result: 'Archived match' });
        return;
      }

      const merged = { ...oldRow };
      const changedFields = [];
      const rowFieldConflicts = [];
      const serverUpdatedTime = parseTimestamp(oldRow.updated_at);
      const serverNewer = importSnapshotTime !== null
        && serverUpdatedTime !== null
        && serverUpdatedTime > importSnapshotTime;

      for (const [field, value] of Object.entries(incoming)) {
        if (field === 'id' || field === 'assigned_to') continue;
        if (isBlankImportedValue(value)) continue;
        if (valuesEquivalent(field, oldRow[field], value, { ...oldRow, ...incoming })) continue;

        const workflowRegression = isWorkflowRegression(field, oldRow[field], value);
        if (serverNewer || workflowRegression) {
          const conflict = {
            id: conflictIdFor(oldRow.id, field),
            shipmentId: oldRow.id,
            shipmentCode: oldRow.shipment_code || oldRow.job_file_number || '',
            field,
            label: FIELD_DEFINITIONS[field]?.label || mapping.columns.find((column) => column.field === field)?.label || field,
            serverValue: oldRow[field] ?? '',
            importedValue: value,
            reason: workflowRegression
              ? 'Potential outdated workflow value. The imported status would move this shipment backward.'
              : 'Relora changed after this file was last modified.',
            sourceSheet
          };
          rowFieldConflicts.push(conflict);
          fieldConflicts.push(conflict);
          continue;
        }

        changedFields.push({
          field,
          oldValue: oldRow[field] ?? '',
          newValue: value
        });
        merged[field] = value;
      }

      if (assignedTo) {
        merged.assigned_to = assignedTo;
        if (!merged.customs_declarant) merged.customs_declarant = assignedTo;
      }

      const automatedMerged = applyAutomation(merged);
      nextRows[rowIndex] = automatedMerged;

      if (changedFields.length > 0) {
        updated += 1;
        safeUpdates += 1;
      } else if (rowFieldConflicts.length === 0) {
        unchanged += 1;
      }

      changes.push({
        type: 'update',
        row: automatedMerged,
        incoming,
        changedFields,
        fieldConflicts: rowFieldConflicts,
        sourceSheet
      });
      rowTrace.push({
        ...traceBase,
        result: rowFieldConflicts.length > 0
          ? 'Needs review'
          : changedFields.length > 0
            ? 'Update'
            : 'Unchanged'
      });
      return;
    }

    const createdRow = {
      current_stage: 'PRE-ARRIVAL',
      completion: 0,
      next_action: '',
      overall_status: 'ON TRACK',
      days_open: 0,
      last_milestone_date: '',
      delay_action_remarks: '',
      ...incoming
    };
    const automatedCreatedRow = applyAutomation(createdRow);
    createdRows.push(automatedCreatedRow);
    for (const key of shipmentMatchKeys(automatedCreatedRow)) existingByKey.set(key, automatedCreatedRow.id);
    created += 1;
    changes.push({ type: 'create', row: automatedCreatedRow, changedFields: [], fieldConflicts: [], sourceSheet });
    rowTrace.push({ ...traceBase, result: 'New' });
  });

  return {
    ...mapping,
    finalRows: [...createdRows, ...nextRows],
    changes,
    fieldConflicts,
    archivedConflicts,
    rowTrace,
    unresolvedConflicts: fieldConflicts.length,
    importSnapshotAt,
    sheetBreakdown,
    summary: {
      total: importedRows.length,
      created,
      updated,
      safeUpdates,
      reviewConflicts: fieldConflicts.length,
      archivedMatches,
      unchanged,
      duplicates,
      missingKey,
      conflicts,
      assignmentConflicts: conflicts
    }
  };
}

function applyFieldConflictResolutions(plan, resolutions = {}) {
  return plan.changes.map((change) => {
    if (change.type !== 'update' || !change.fieldConflicts?.length) return change;

    const row = { ...change.row };
    const changedFields = [...(change.changedFields || [])];

    for (const conflict of change.fieldConflicts) {
      if (resolutions[conflict.id] !== 'import') continue;
      row[conflict.field] = conflict.importedValue;
      changedFields.push({
        field: conflict.field,
        oldValue: conflict.serverValue,
        newValue: conflict.importedValue,
        reviewed: true
      });
    }

    return { ...change, row: applyAutomation(row), changedFields };
  });
}

function restoreArchivedChange(change) {
  const oldRow = change.row || {};
  const incoming = change.incoming || {};
  const merged = { ...oldRow, archived_at: null, archived_by: null };
  const changedFields = [];

  for (const [field, value] of Object.entries(incoming)) {
    if (field === 'id') continue;
    if (isBlankImportedValue(value)) continue;
    if (valuesEquivalent(field, oldRow[field], value, { ...oldRow, ...incoming })) continue;
    merged[field] = value;
    changedFields.push({ field, oldValue: oldRow[field] ?? '', newValue: value, reviewed: true });
  }

  return {
    ...change,
    type: 'restore_update',
    row: applyAutomation(merged),
    changedFields
  };
}

export function resolveImportReview(plan, resolutions = {}, archivedResolutions = {}) {
  const fieldResolved = applyFieldConflictResolutions(plan, resolutions);
  const changes = fieldResolved.map((change) => {
    if (change.type !== 'archived_match') return change;
    const choice = archivedResolutions[change.archivedConflictId] || 'skip';
    if (choice === 'restore_update') return restoreArchivedChange(change);
    return { ...change, type: 'skip' };
  });

  const unresolvedConflicts = (plan.fieldConflicts || []).filter(
    (conflict) => !['server', 'import'].includes(resolutions[conflict.id])
  ).length;

  const resolvedById = new Map(
    changes
      .filter((change) => ['update', 'restore_update'].includes(change.type) && change.row?.id)
      .map((change) => [change.row.id, change.row])
  );

  const finalRows = plan.finalRows.map((row) => resolvedById.get(row.id) || row);

  return {
    ...plan,
    changes,
    finalRows,
    resolutions: { ...resolutions },
    archivedResolutions: { ...archivedResolutions },
    unresolvedConflicts
  };
}

export function resolveImportConflicts(plan, resolutions = {}) {
  return resolveImportReview(plan, resolutions, {});
}
