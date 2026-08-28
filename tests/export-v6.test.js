import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRows } from '../src/lib/exporter.js';

const rows = [{ id: '1', job_file_number: 'JF-1', customer: 'A', internal: 'ignore' }];

test('export uses requested visible fields and readable labels', () => {
  const result = buildExportRows(rows, ['job_file_number', 'customer']);
  assert.deepEqual(result, [{ 'Job File No.': 'JF-1', Customer: 'A' }]);
});
