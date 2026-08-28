import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDisplaySegments } from '../src/lib/columnLayout.js';

test('keeps imported field order while grouping adjacent fields by color group', () => {
  const segments = buildDisplaySegments([
    'customer',
    'eta',
    'entry_no',
    'broker_representative',
    'billed_date',
    'custom__special_remarks'
  ]);

  assert.deepEqual(
    segments.map((segment) => ({ group: segment.group, fields: segment.fields })),
    [
      { group: 'shipment', fields: ['customer', 'eta'] },
      { group: 'customs', fields: ['entry_no'] },
      { group: 'portal', fields: ['broker_representative'] },
      { group: 'biller', fields: ['billed_date'] },
      { group: 'imported', fields: ['custom__special_remarks'] }
    ]
  );
});
