import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImportPayloads, makeShipmentCode } from '../src/lib/dataApi.js';
import { mapImportedHeaders } from '../src/lib/importer.js';

test('multiple TBA entry rows use their real House BL instead of colliding on ENTRY-TBA', () => {
  const payloads = prepareImportPayloads([
    {
      type: 'create',
      row: {
        entry_no: 'TBA',
        house_awb_bl: '6731106866',
        customer: 'First'
      }
    },
    {
      type: 'create',
      row: {
        entry_no: 'TBA',
        house_awb_bl: '6731106867',
        customer: 'Second'
      }
    }
  ]);

  assert.deepEqual(payloads.map((row) => row.shipment_code), [
    'BL-6731106866',
    'BL-6731106867'
  ]);
});

test('shipment code ignores placeholder identifiers and falls through Job File, Entry, House BL, Master BL', () => {
  assert.equal(makeShipmentCode({ job_file_number: 'TBD', entry_no: 'C-30771', house_awb_bl: 'HBL-1', master_awb_bl: 'MBL-1' }), 'ENTRY-C-30771');
  assert.equal(makeShipmentCode({ job_file_number: 'N/A', entry_no: 'NONE', house_awb_bl: 'HBL-1', master_awb_bl: 'MBL-1' }), 'BL-HBL-1');
  assert.equal(makeShipmentCode({ job_file_number: '-', entry_no: 'TBA', house_awb_bl: 'NA', master_awb_bl: 'MBL-1' }), 'MBL-MBL-1');
});

test('all-placeholder identifiers use a generated WEB code instead of a shared placeholder code', () => {
  const code = makeShipmentCode({ job_file_number: 'TBA', entry_no: 'TBD', house_awb_bl: 'N/A', master_awb_bl: 'NONE' });
  assert.match(code, /^WEB-/);
});


test('FME workbook BL headers map to shipment identifiers used by code generation', () => {
  const mapping = mapImportedHeaders(['B/L NUMBER', 'MASTER BL', 'ENTRY NO.']);
  assert.equal(mapping.columns.find((column) => column.originalHeader === 'B/L NUMBER')?.field, 'house_awb_bl');
  assert.equal(mapping.columns.find((column) => column.originalHeader === 'MASTER BL')?.field, 'master_awb_bl');
  assert.equal(mapping.columns.find((column) => column.originalHeader === 'ENTRY NO.')?.field, 'entry_no');
});
