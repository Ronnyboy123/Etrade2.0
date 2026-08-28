import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSmartSearch } from '../src/lib/search.js';

const columns = [
  { field: 'eta', label: 'ETA' },
  { field: 'entry_no', label: 'Entry No.' },
  { field: 'customer', label: 'Customer' },
  { field: 'billed_date', label: 'Billing Date' }
];

test('exact column search resolves to a column jump', () => {
  const result = resolveSmartSearch('ETA', columns);
  assert.deepEqual(result, { type: 'column', field: 'eta', label: 'ETA' });
});

test('friendly partial column search resolves when unambiguous', () => {
  const result = resolveSmartSearch('billed', columns);
  assert.equal(result.type, 'column');
  assert.equal(result.field, 'billed_date');
});

test('non-column search remains a row search', () => {
  const result = resolveSmartSearch('KNAUF', columns);
  assert.deepEqual(result, { type: 'rows', query: 'KNAUF' });
});
