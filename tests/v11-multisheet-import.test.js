import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const importer = await import('../src/lib/importer.js');
const {
  buildImportPlan,
  extractWorkbookSheets,
  combineWorkbookSheets,
  IMPORT_SOURCE_SHEET_FIELD
} = importer;

function makeTenSheetWorkbook() {
  const SheetNames = Array.from({ length: 10 }, (_, index) => `Sheet ${index + 1}`);
  const Sheets = Object.fromEntries(SheetNames.map((name) => [name, name]));
  const matrices = Object.fromEntries(SheetNames.map((name, index) => [name, [
    ['JOB FILE NUMBER', 'CUSTOMER'],
    [`JF-${String(index + 1).padStart(2, '0')}`, `Customer ${index + 1}`]
  ]]));
  return { workbook: { SheetNames, Sheets }, matrices };
}

test('importer exposes workbook helpers for multi-sheet import', () => {
  assert.equal(typeof extractWorkbookSheets, 'function');
  assert.equal(typeof combineWorkbookSheets, 'function');
});

test('extracts all 10 workbook sheets and reports row counts', () => {
  const { workbook, matrices } = makeTenSheetWorkbook();
  const sheets = extractWorkbookSheets(workbook, (worksheet) => matrices[worksheet]);

  assert.equal(sheets.length, 10);
  assert.equal(sheets[0].name, 'Sheet 1');
  assert.equal(sheets[9].name, 'Sheet 10');
  assert.equal(sheets.every((sheet) => sheet.rowCount === 1), true);
});

test('combines selected sheets, preserves first-seen header order, and tags source sheet', () => {
  const { workbook, matrices } = makeTenSheetWorkbook();
  matrices['Sheet 2'][0].push('DELIVERY DATE');
  matrices['Sheet 2'][1].push(new Date(2026, 8, 1));
  const sheets = extractWorkbookSheets(workbook, (worksheet) => matrices[worksheet]);

  const selected = combineWorkbookSheets(sheets, ['Sheet 1', 'Sheet 2']);

  assert.deepEqual(selected.headers, ['JOB FILE NUMBER', 'CUSTOMER', 'DELIVERY DATE']);
  assert.equal(selected.rows.length, 2);
  assert.equal(selected.rows[0][IMPORT_SOURCE_SHEET_FIELD], 'Sheet 1');
  assert.equal(selected.rows[1][IMPORT_SOURCE_SHEET_FIELD], 'Sheet 2');
  assert.deepEqual(selected.sheetBreakdown, [
    { name: 'Sheet 1', rowCount: 1 },
    { name: 'Sheet 2', rowCount: 1 }
  ]);
});


test('same header with different casing across sheets maps into the canonical combined column', () => {
  const sheets = [
    { name: 'A', headers: ['JOB FILE NUMBER', 'CUSTOMER'], rows: [{ 'JOB FILE NUMBER': 'JF-A', CUSTOMER: 'Alpha' }], rowCount: 1 },
    { name: 'B', headers: ['Job File Number', 'Customer'], rows: [{ 'Job File Number': 'JF-B', Customer: 'Beta' }], rowCount: 1 }
  ];
  const combined = combineWorkbookSheets(sheets, ['A', 'B']);
  const plan = buildImportPlan({ existingRows: [], importedRows: combined.rows, headers: combined.headers, assignedTo: 'Ella' });

  assert.deepEqual(combined.headers, ['JOB FILE NUMBER', 'CUSTOMER']);
  assert.equal(plan.summary.created, 2);
  assert.equal(plan.changes[1].row.job_file_number, 'JF-B');
  assert.equal(plan.changes[1].row.customer, 'Beta');
});

test('combined 10-sheet rows keep source sheet traceability in the import plan', () => {
  const { workbook, matrices } = makeTenSheetWorkbook();
  const sheets = extractWorkbookSheets(workbook, (worksheet) => matrices[worksheet]);
  const combined = combineWorkbookSheets(sheets, workbook.SheetNames);
  const plan = buildImportPlan({
    existingRows: [],
    importedRows: combined.rows,
    headers: combined.headers,
    assignedTo: 'Ella',
    sheetBreakdown: combined.sheetBreakdown
  });

  assert.equal(plan.summary.total, 10);
  assert.equal(plan.summary.created, 10);
  assert.equal(plan.changes[0].sourceSheet, 'Sheet 1');
  assert.equal(plan.changes[9].sourceSheet, 'Sheet 10');
  assert.equal(plan.sheetBreakdown.length, 10);
  assert.equal(plan.columns.some((column) => column.originalHeader === IMPORT_SOURCE_SHEET_FIELD), false);
});


test('row trace keeps duplicate rows from different selected sheets visible for troubleshooting', () => {
  const sheets = [
    { name: 'Sheet A', headers: ['JOB FILE NUMBER', 'CUSTOMER'], rows: [{ 'JOB FILE NUMBER': 'JF-DUP', CUSTOMER: 'Alpha' }], rowCount: 1 },
    { name: 'Sheet B', headers: ['JOB FILE NUMBER', 'CUSTOMER'], rows: [{ 'JOB FILE NUMBER': 'JF-DUP', CUSTOMER: 'Beta' }], rowCount: 1 }
  ];
  const combined = combineWorkbookSheets(sheets, ['Sheet A', 'Sheet B']);
  const plan = buildImportPlan({ existingRows: [], importedRows: combined.rows, headers: combined.headers, assignedTo: 'Ella' });

  assert.equal(plan.summary.duplicates, 1);
  assert.equal(plan.rowTrace.length, 2);
  assert.deepEqual(plan.rowTrace[1], {
    sourceSheet: 'Sheet B',
    shipmentCode: 'JF-DUP',
    result: 'Duplicate in selected sheets'
  });
});

test('multi-sheet import UI offers All Sheets, per-sheet selection, and source-sheet traceability', () => {
  const source = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /workbook\.SheetNames\[0\]/);
  assert.match(source, /All Sheets/);
  assert.match(source, /Review Selected Sheets/);
  assert.match(source, /Source Sheet/);
  assert.match(source, /plan\.rowTrace/);
});


test('multi-sheet selector and trace table have dedicated responsive styling', () => {
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.sheet-selection-panel/);
  assert.match(styles, /\.sheet-option-list/);
  assert.match(styles, /\.import-trace-wrap/);
});

test('v11.1 package version is 1.1.1', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '1.1.1');
});
