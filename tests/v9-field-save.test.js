import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ShipmentConflictError,
  isShipmentConflictResult,
  serializeFieldValue,
  buildAutomationPatch
} from '../src/lib/dataApi.js';

test('field serializer preserves v8 date/numeric safety for field-level saves', () => {
  assert.equal(serializeFieldValue('eta', '1-Jul', { service_month: '202607' }), '2026-07-01');
  assert.equal(serializeFieldValue('eta', 'N/A', { service_month: '202607' }), null);
  assert.equal(serializeFieldValue('week_no', '4', {}), 4);
  assert.equal(serializeFieldValue('custom__reference', 'ABC', {}), 'ABC');
});

test('field conflict results are recognizable and preserve server context', () => {
  const result = { status: 'conflict', current_value: 'Server', server_version: 3, row: { id: '1', version: 3 } };
  assert.equal(isShipmentConflictResult(result), true);
  const error = new ShipmentConflictError(result, { field: 'customer', baseValue: 'Old', proposedValue: 'Mine' });
  assert.equal(error.name, 'ShipmentConflictError');
  assert.equal(error.field, 'customer');
  assert.equal(error.serverValue, 'Server');
  assert.equal(error.serverRow.version, 3);
  assert.equal(error.proposedValue, 'Mine');
});

test('automation patch contains derived workflow fields but not arbitrary shipment fields', () => {
  const patch = buildAutomationPatch({
    current_stage: 'PAID', completion: 60, next_action: 'Follow release', overall_status: 'ON TRACK',
    boc_status: 'PAID', days_open: 3, customer: 'Do not include me'
  });
  assert.equal(patch.current_stage, 'PAID');
  assert.equal(patch.completion, 60);
  assert.equal(patch.boc_status, 'PAID');
  assert.equal(Object.hasOwn(patch, 'customer'), false);
});
