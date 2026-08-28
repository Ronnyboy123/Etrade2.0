import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateValue, serializeShipmentRow } from '../src/lib/dataApi.js';

const PLACEHOLDERS = ['.', '..', '...', 'TBA', 'TBD', 'NIL'];

test('spreadsheet date placeholders including dot values serialize as null', () => {
  for (const value of PLACEHOLDERS) {
    assert.equal(normalizeDateValue(value, { service_month: '202608' }), null, value);
  }
});

test('unrecognized date text never reaches a PostgreSQL date field', () => {
  assert.equal(normalizeDateValue('pending date', { service_month: '202608' }), null);
  assert.equal(normalizeDateValue('32-Aug-2026', { service_month: '202608' }), null);

  const db = serializeShipmentRow({
    shipment_code: 'SHP-BAD-DATE-TEXT',
    eta: '.',
    ata: 'pending date',
    lodgement: '32-Aug-2026'
  });

  assert.equal(db.eta, null);
  assert.equal(db.ata, null);
  assert.equal(db.lodgement, null);
});
