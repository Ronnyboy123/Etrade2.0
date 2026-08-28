import test from 'node:test';
import assert from 'node:assert/strict';
import { mapImportedHeaders } from '../src/lib/importer.js';
import { buildDisplaySegments } from '../src/lib/columnLayout.js';

test('unknown imported field inherits shipment group from neighboring shipment columns', () => {
  const result = mapImportedHeaders(['CUSTOMER', 'SHIPPER', 'AIR/SEA', 'HOUSE AWB / BL NO.', 'ETA']);
  const custom = result.columns.find((column) => column.originalHeader === 'AIR/SEA');

  assert.equal(custom.isCustom, true);
  assert.equal(custom.group, 'shipment');
});

test('unknown imported field inherits customs group when surrounded by customs fields', () => {
  const result = mapImportedHeaders(['LODGEMENT', 'CUSTOM STATUS', 'ASSESSED', 'PAID']);
  const custom = result.columns.find((column) => column.originalHeader === 'CUSTOM STATUS');

  assert.equal(custom.group, 'customs');
});

test('unknown field at a section boundary prefers the previous equally-close group', () => {
  const result = mapImportedHeaders(['ETA', 'SPECIAL REF', 'LOCATION OF GOODS']);
  const custom = result.columns.find((column) => column.originalHeader === 'SPECIAL REF');

  assert.equal(custom.group, 'shipment');
});

test('display segments use imported metadata group instead of generic imported gray', () => {
  const mapping = mapImportedHeaders(['CUSTOMER', 'AIR/SEA', 'ETA']);
  const segments = buildDisplaySegments(mapping.displayOrder, mapping.columns);

  assert.deepEqual(segments, [
    { group: 'shipment', fields: ['customer', 'custom__air_sea', 'eta'] }
  ]);
});
