import { AUTOMATED_FIELDS, FIELD_DEFINITIONS } from './importer.js';
import { GROUP_META, buildDisplaySegments, getFieldGroup } from './columnLayout.js';

const DEFAULT_EXPORT_FIELDS = [
  ...AUTOMATED_FIELDS,
  'service_month', 'job_file_number', 'customer', 'shipper', 'mode',
  'house_awb_bl', 'master_awb_bl', 'pre_alert_shipping_documents', 'eta',
  'cw_air_cbm_lcl', 'number_of_container', 'description', 'dt_computation',
  'week_no', 'fundcast', 'ata', 'port_of_entry', 'location_of_goods',
  'lodgement', 'assessed', 'paid', 'entry_no', 'selectivity_color',
  'portal_submission', 'broker_representative', 'portal_ticket_efile',
  'releasing_date', 'liquidation_processor', 'liquidation_tl',
  'endorsement_to_biller', 'team_leader', 'customs_declarant', 'received_folder',
  'billed_date', 'efile', 'dispatch', 'timeline_duty_tax', 'timeline_lodgement',
  'timeline_fan', 'timeline_cargo_releasing', 'timeline_liquidation',
  'timeline_liquidation_tl', 'timeline_billing', 'timeline_closing'
];

const DATE_FIELDS = new Set([
  'validated_manifest_date', 'last_milestone_date', 'pre_alert_shipping_documents', 'eta',
  'dt_computation', 'ata', 'lodgement', 'assessed', 'paid', 'portal_submission',
  'releasing_date', 'liquidation_processor', 'liquidation_tl', 'endorsement_to_biller',
  'received_folder', 'billed_date', 'dispatch'
]);

const GROUP_COLORS = {
  auto: { group: '5C9BD3', header: 'DBEAF7', headerText: '173B64' },
  shipment: { group: '173B64', header: '173B64', headerText: 'FFFFFF' },
  customs: { group: '117983', header: '117983', headerText: 'FFFFFF' },
  portal: { group: '347FBD', header: '347FBD', headerText: 'FFFFFF' },
  biller: { group: '4F8532', header: '4F8532', headerText: 'FFFFFF' },
  timeline: { group: 'D55D08', header: 'F3B184', headerText: '4C2A10' },
  imported: { group: '66778B', header: 'E9EEF4', headerText: '33475D' }
};

function readableLabel(field, meta) {
  return FIELD_DEFINITIONS[field]?.label || meta.get(field)?.label || field.replace(/^custom__/, '').replaceAll('_', ' ');
}

function columnKind(field) {
  if (DATE_FIELDS.has(field)) return 'date';
  if (field === 'completion') return 'percent';
  return 'text';
}

function suggestedWidth(label, field) {
  if (field === 'delay_action_remarks' || field === 'description') return 34;
  if (field === 'customer' || field === 'shipper') return 24;
  if (field === 'house_awb_bl' || field === 'master_awb_bl') return 21;
  if (field === 'next_action' || field === 'current_stage') return 24;
  return Math.max(13, Math.min(24, String(label).length + 3));
}

function sanitizeSheetName(value) {
  const cleaned = String(value || 'Shipments').replace(/[\\/*?:\[\]]/g, ' ').trim();
  return (cleaned || 'Shipments').slice(0, 31);
}

export function buildExportRows(rows, fields = DEFAULT_EXPORT_FIELDS, columnMeta = []) {
  const meta = new Map((columnMeta || []).map((item) => [item.field, item]));
  return rows.map((row) => {
    const output = {};
    for (const field of fields) {
      output[readableLabel(field, meta)] = row[field] ?? '';
    }
    return output;
  });
}

export function buildFormattedExportSpec(
  rows,
  fields = DEFAULT_EXPORT_FIELDS,
  columnMeta = [],
  sheetName = 'Shipments'
) {
  const meta = new Map((columnMeta || []).map((item) => [item.field, item]));
  const columns = fields.map((field) => {
    const label = readableLabel(field, meta);
    return {
      field,
      label,
      group: getFieldGroup(field, meta),
      kind: columnKind(field),
      width: suggestedWidth(label, field)
    };
  });

  const segments = buildDisplaySegments(fields, meta);
  let cursor = 1;
  const groups = segments.map((segment) => {
    const start = cursor;
    const end = cursor + segment.fields.length - 1;
    cursor = end + 1;
    return {
      key: segment.group,
      label: GROUP_META[segment.group]?.label || GROUP_META.imported.label,
      start,
      end,
      colors: GROUP_COLORS[segment.group] || GROUP_COLORS.imported
    };
  });

  return {
    sheetName: sanitizeSheetName(sheetName),
    columns,
    groups,
    rows
  };
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[match[2].toLowerCase()];
    if (month !== undefined) return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  }

  return null;
}

function applyBorder(cell) {
  const side = { style: 'thin', color: { argb: 'FFD9E1EA' } };
  cell.border = { top: side, left: side, bottom: side, right: side };
}

function statusFill(field, value) {
  const text = String(value || '').trim().toUpperCase();
  if (field === 'overall_status') {
    if (text === 'ON TRACK') return 'FFE2F0D9';
    if (text === 'ACTION DUE') return 'FFFFF2CC';
    if (text === 'DELAYED') return 'FFF4CCCC';
    if (text === 'CLOSED') return 'FFD9EAF7';
  }
  if (field === 'selectivity_color') {
    if (text === 'GREEN') return 'FFD9EAD3';
    if (text === 'YELLOW') return 'FFFFF2CC';
    if (text === 'RED') return 'FFF4CCCC';
  }
  return null;
}

export async function downloadRowsAsExcel(
  rows,
  filename = 'shipments.xlsx',
  fields = DEFAULT_EXPORT_FIELDS,
  columnMeta = [],
  options = {}
) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const spec = buildFormattedExportSpec(rows, fields, columnMeta, options.sheetName || 'Shipments');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Relora';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(spec.sheetName);
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];

  worksheet.properties.defaultRowHeight = 20;
  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 42;

  for (const group of spec.groups) {
    if (group.end > group.start) worksheet.mergeCells(1, group.start, 1, group.end);
    const cell = worksheet.getCell(1, group.start);
    cell.value = group.label.toUpperCase();
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${group.colors.group}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(cell);
  }

  spec.columns.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    excelColumn.width = column.width;

    const header = worksheet.getCell(2, index + 1);
    header.value = column.label;
    const colors = GROUP_COLORS[column.group] || GROUP_COLORS.imported;
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colors.header}` } };
    header.font = { bold: true, color: { argb: `FF${colors.headerText}` }, size: 9 };
    header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(header);
  });

  spec.rows.forEach((record, rowIndex) => {
    const excelRow = worksheet.getRow(rowIndex + 3);
    excelRow.height = 20;

    spec.columns.forEach((column, columnIndex) => {
      const cell = excelRow.getCell(columnIndex + 1);
      const rawValue = record[column.field];

      if (column.kind === 'date') {
        const parsed = parseDateValue(rawValue);
        cell.value = parsed || rawValue || '';
        if (parsed) cell.numFmt = 'dd-mmm-yyyy';
      } else if (column.kind === 'percent' && rawValue !== '' && rawValue != null) {
        const numeric = Number(rawValue);
        cell.value = Number.isFinite(numeric) ? numeric / 100 : rawValue;
        if (Number.isFinite(numeric)) cell.numFmt = '0%';
      } else {
        cell.value = rawValue ?? '';
      }

      cell.alignment = { vertical: 'middle', wrapText: true };
      applyBorder(cell);

      const fill = statusFill(column.field, rawValue);
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    });
  });

  if (spec.columns.length) {
    worksheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: spec.columns.length }
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
