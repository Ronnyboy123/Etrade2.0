import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareImportPayloads } from '../src/lib/dataApi.js';

const schema = await readFile(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('reviewed import payload carries intent and expected row version', () => {
  const [payload] = prepareImportPayloads([{
    type: 'update',
    row: { id: 'db-1', shipment_code: 'JF-001', job_file_number: 'JF-001', version: 7, customer: 'Reviewed' }
  }]);

  assert.equal(payload._relora_import_intent, 'update');
  assert.equal(payload._relora_expected_version, 7);
  assert.equal('id' in payload, false);
});

test('import RPC rejects rows that changed after the review snapshot', () => {
  assert.match(schema, /_relora_import_intent/);
  assert.match(schema, /_relora_expected_version/);
  assert.match(schema, /changed after import review/i);
  assert.match(schema, /v_before\.version.*v_expected_version/s);
});
