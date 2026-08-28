import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareImportPayloads } from '../src/lib/dataApi.js';

test('import persistence prepares create and update rows for one idempotent shipment_code upsert', () => {
  const payloads = prepareImportPayloads([
    {
      type: 'create',
      row: {
        shipment_code: 'JF-001',
        job_file_number: 'JF-001',
        customer: 'First Customer'
      }
    },
    {
      type: 'update',
      row: {
        id: 'db-row-2',
        shipment_code: 'JF-002',
        job_file_number: 'JF-002',
        customer: 'Updated Customer'
      }
    },
    {
      type: 'conflict',
      row: {
        shipment_code: 'JF-003',
        job_file_number: 'JF-003'
      }
    }
  ]);

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads.map((row) => row.shipment_code), ['JF-001', 'JF-002']);
  assert.equal(payloads[1].customer, 'Updated Customer');
  assert.equal('id' in payloads[1], false);
});
