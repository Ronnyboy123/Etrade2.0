import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateValue, serializeShipmentRow } from '../src/lib/dataApi.js';
import { applyAutomation } from '../src/lib/automation.js';

const PLACEHOLDERS = ['N/A', 'NA', 'N.A.', '-', '—', 'NONE', 'Not Applicable'];

test('date placeholders are normalized to null before Supabase serialization', () => {
  for (const value of PLACEHOLDERS) {
    assert.equal(normalizeDateValue(value, { service_month: '202608' }), null, value);
  }
});

test('shipment rows with N/A in date fields serialize without invalid PostgreSQL dates', () => {
  const db = serializeShipmentRow({
    shipment_code: 'SHP-NA-DATES',
    service_month: '202608',
    eta: 'N/A',
    ata: 'N/A',
    dt_computation: 'N/A',
    lodgement: 'N/A',
    assessed: 'N/A',
    paid: 'N/A'
  });

  assert.equal(db.eta, null);
  assert.equal(db.ata, null);
  assert.equal(db.dt_computation, null);
  assert.equal(db.lodgement, null);
  assert.equal(db.assessed, null);
  assert.equal(db.paid, null);
});

test('N/A date placeholders do not advance automated shipment stage or BOC status', () => {
  const row = applyAutomation({
    ata: 'N/A',
    dt_computation: 'N/A',
    lodgement: 'N/A',
    assessed: 'N/A',
    paid: 'N/A',
    releasing_date: 'N/A'
  }, '2026-08-28');

  assert.equal(row.current_stage, 'PRE-ARRIVAL');
  assert.equal(row.boc_status, 'PENDING');
});
