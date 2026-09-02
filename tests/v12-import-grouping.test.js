import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHeaderRow, parseSheetRows, groupImportedShipmentRows } from '../src/lib/importGrouping.js';

test('detectHeaderRow skips title rows and chooses the strongest recognized header row', () => {
  const matrix = [
    ['NEW PRE-ALERTS', 'FOR CHECKING', '', '', ''],
    ['', '', '', '', ''],
    ['SERVICE MONTH', 'FORWARDER', 'HOUSE AWB / BL NO.', 'ENTRY NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'],
    ['21-Sep', 'EXPEDITORS', 'HBL-1', 'TBA', 'SKU-1', 'Item 1', 10, 'PCE']
  ];
  const detected = detectHeaderRow(matrix);
  assert.equal(detected.headerIndex, 2);
  assert.equal(detected.headers[2], 'HOUSE AWB / BL NO.');
});

test('parseSheetRows carries source row number and section marker without importing the marker', () => {
  const matrix = [
    ['SERVICE MONTH', 'FORWARDER', 'HOUSE AWB / BL NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'],
    ['NEW PRE-ALERTS', '', '', '', '', '', ''],
    ['21-Sep', 'EXPEDITORS', 'HBL-1', 'SKU-1', 'Item 1', 10, 'PCE'],
    ['AIR SHIPMENTS', '', '', '', '', '', ''],
    ['1-Sep', 'EXPEDITORS', '079-12345678', 'SKU-2', 'Item 2', 2, 'PCE']
  ];
  const parsed = parseSheetRows(matrix, 'INCOMING');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].sourceSection, 'NEW PRE-ALERTS');
  assert.equal(parsed.rows[0].sourceRowNumber, 3);
  assert.equal(parsed.rows[1].sourceSection, 'AIR SHIPMENTS');
  assert.equal(parsed.rows[1].sourceRowNumber, 5);
});

test('detectHeaderRow rejects sheets without a credible shipment header set', () => {
  assert.throws(() => detectHeaderRow([
    ['NEW PRE-ALERTS', 'FOR CHECKING'],
    ['DATE', 'STATUS'],
    ['21-Sep', 'WAITING']
  ]), /No credible shipment header row/i);
});

test('repeated House BL rows become one shipment group with multiple details', () => {
  const rows = [
    { raw: { 'HOUSE AWB / BL NO.': 'COSU6506920530', MATERIAL: 'F00001594', DESCRIPTION: 'FX CorDiax 800', QTY: 24, UOM: 'PCE' }, sourceSheet: 'INCOMING', sourceRowNumber: 10, sourceSection: 'NEW PRE-ALERTS' },
    { raw: { 'HOUSE AWB / BL NO.': 'COSU6506920530', MATERIAL: '5060781', DESCRIPTION: 'BIBAG 5008 650g', QTY: 4480, UOM: 'PCE' }, sourceSheet: 'INCOMING', sourceRowNumber: 11, sourceSection: 'NEW PRE-ALERTS' }
  ];
  const groups = groupImportedShipmentRows(rows, ['HOUSE AWB / BL NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'], 'Ella');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].details.length, 2);
  assert.equal(groups[0].masterRow.house_awb_bl, 'COSU6506920530');
});

test('detail line keys are stable when source row positions move', () => {
  const headers = ['HOUSE AWB / BL NO.', 'CONTAINER NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'];
  const makeRows = (rowNumber) => [{
    raw: { 'HOUSE AWB / BL NO.': 'HBL-1', 'CONTAINER NO.': 'CONT-1', MATERIAL: 'SKU-1', DESCRIPTION: 'Item', QTY: 10, UOM: 'PCE' },
    sourceSheet: 'INCOMING', sourceRowNumber: rowNumber, sourceSection: 'NEW PRE-ALERTS'
  }];
  const first = groupImportedShipmentRows(makeRows(8), headers)[0].details[0].line_key;
  const moved = groupImportedShipmentRows(makeRows(25), headers)[0].details[0].line_key;
  assert.equal(first, moved);
});

test('identical business detail rows are both preserved using occurrence suffixes', () => {
  const source = {
    raw: { 'HOUSE AWB / BL NO.': 'HBL-2', MATERIAL: 'SKU-2', DESCRIPTION: 'Same', QTY: 5, UOM: 'PCE' },
    sourceSheet: 'INCOMING', sourceSection: 'NEW PRE-ALERTS'
  };
  const groups = groupImportedShipmentRows([
    { ...source, sourceRowNumber: 9 },
    { ...source, sourceRowNumber: 10 }
  ], ['HOUSE AWB / BL NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM']);
  assert.equal(groups[0].details.length, 2);
  assert.notEqual(groups[0].details[0].line_key, groups[0].details[1].line_key);
  assert.match(groups[0].details[0].line_key, /:1$/);
  assert.match(groups[0].details[1].line_key, /:2$/);
});

test('placeholder identifiers and template-only rows do not create shipment groups', () => {
  const groups = groupImportedShipmentRows([
    { raw: { 'ENTRY NO.': 'TBA', STATUS: 'WAITING FOR ARRIVAL' }, sourceSheet: 'INCOMING', sourceRowNumber: 20, sourceSection: '' },
    { raw: { 'ENTRY NO.': 'N/A', STATUS: 'WAITING FOR ARRIVAL' }, sourceSheet: 'INCOMING', sourceRowNumber: 21, sourceSection: '' }
  ], ['ENTRY NO.', 'STATUS']);
  assert.equal(groups.length, 0);
});

test('mixed nonblank master values raise a review warning while keeping first source value', () => {
  const groups = groupImportedShipmentRows([
    { raw: { 'HOUSE AWB / BL NO.': 'HBL-3', FORWARDER: 'EXPEDITORS', MATERIAL: 'A' }, sourceSheet: 'INCOMING', sourceRowNumber: 3, sourceSection: '' },
    { raw: { 'HOUSE AWB / BL NO.': 'HBL-3', FORWARDER: 'DHL GLOBAL', MATERIAL: 'B' }, sourceSheet: 'INCOMING', sourceRowNumber: 4, sourceSection: '' }
  ], ['HOUSE AWB / BL NO.', 'FORWARDER', 'MATERIAL']);
  assert.equal(groups[0].masterRow.custom__forwarder, 'EXPEDITORS');
  assert.equal(groups[0].masterConflicts.length, 1);
  assert.deepEqual(groups[0].masterConflicts[0].values, ['EXPEDITORS', 'DHL GLOBAL']);
});
