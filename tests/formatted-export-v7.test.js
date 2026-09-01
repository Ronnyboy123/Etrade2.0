import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormattedExportSpec } from '../src/lib/exporter.js';
import { mapImportedHeaders, AUTOMATED_FIELDS } from '../src/lib/importer.js';

test('formatted export creates merged consecutive group headers in current layout order', () => {
  const mapping = mapImportedHeaders(['CUSTOMER', 'AIR/SEA', 'ETA', 'LODGEMENT', 'PAID']);
  const fields = [...AUTOMATED_FIELDS, ...mapping.displayOrder];
  const spec = buildFormattedExportSpec(
    [{ customer: 'ABC', custom__air_sea: 'SEA', eta: '2026-08-05', lodgement: '2026-08-06', paid: '2026-08-07' }],
    fields,
    mapping.columns,
    'Andrea'
  );

  assert.equal(spec.sheetName, 'Andrea');
  assert.deepEqual(
    spec.groups.map((group) => ({ key: group.key, start: group.start, end: group.end })),
    [
      { key: 'auto', start: 1, end: 8 },
      { key: 'shipment', start: 9, end: 11 },
      { key: 'customs', start: 12, end: 13 }
    ]
  );
  assert.equal(spec.columns[9].field, 'custom__air_sea');
  assert.equal(spec.columns[9].group, 'shipment');
});

test('formatted export marks date columns and percentage column for Excel formatting', () => {
  const spec = buildFormattedExportSpec(
    [{ validated_manifest_date: '2026-08-05', completion: 64 }],
    ['validated_manifest_date', 'completion'],
    [],
    'Shipments'
  );

  assert.equal(spec.columns[0].kind, 'date');
  assert.equal(spec.columns[1].kind, 'percent');
});
