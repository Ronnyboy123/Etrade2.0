import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenShipmentRow, serializeShipmentRow } from '../src/lib/dataApi.js';

test('custom imported fields round-trip through custom_fields jsonb', () => {
  const db = serializeShipmentRow({
    id: '11111111-1111-1111-1111-111111111111',
    shipment_code: 'JF-001',
    job_file_number: 'JF-001',
    customer: 'ABC',
    custom__air_sea: 'SEA (MNL)',
    custom__special_note: 'Hold'
  });

  assert.deepEqual(db.custom_fields, {
    custom__air_sea: 'SEA (MNL)',
    custom__special_note: 'Hold'
  });
  assert.equal(db.job_file_number, 'JF-001');
  assert.equal('custom__air_sea' in db, false);

  const ui = flattenShipmentRow(db);
  assert.equal(ui.custom__air_sea, 'SEA (MNL)');
  assert.equal(ui.custom__special_note, 'Hold');
});

test('serializer excludes UI-only and database-managed properties', () => {
  const db = serializeShipmentRow({
    id: 'db-id',
    created_at: 'x',
    updated_at: 'y',
    shipment_code: 'SHP-1',
    job_file_number: 'SHP-1',
    assigned_to: 'Andrea',
    team_id: 'team2'
  });

  assert.equal('id' in db, false);
  assert.equal('created_at' in db, false);
  assert.equal('updated_at' in db, false);
  assert.equal(db.shipment_code, 'SHP-1');
});
