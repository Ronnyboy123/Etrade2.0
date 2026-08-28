import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRealtimeEvent, reconcileRealtimeEvent } from '../src/lib/realtime.js';

test('realtime insert/update/delete keeps active rows in sync', () => {
  let rows = [{ id: '1', customer: 'A', version: 1 }];
  rows = applyRealtimeEvent(rows, { eventType: 'INSERT', new: { id: '2', customer: 'B', version: 1, archived_at: null } });
  assert.equal(rows.length, 2);
  rows = applyRealtimeEvent(rows, { eventType: 'UPDATE', new: { id: '1', customer: 'A2', version: 2, archived_at: null } });
  assert.equal(rows.find((row) => row.id === '1').customer, 'A2');
  rows = applyRealtimeEvent(rows, { eventType: 'DELETE', old: { id: '2' } });
  assert.deepEqual(rows.map((row) => row.id), ['1']);
});

test('realtime archive update removes the row from active data', () => {
  const rows = [{ id: '1', customer: 'A', version: 1 }];
  const next = applyRealtimeEvent(rows, { eventType: 'UPDATE', new: { id: '1', archived_at: '2026-08-28T10:00:00Z', version: 2 } });
  assert.deepEqual(next, []);
});

test('active editor keeps its field while different remote fields merge', () => {
  const rows = [{ id: '1', customer: 'Local edit', shipper: 'Old', version: 1 }];
  const event = { eventType: 'UPDATE', new: { id: '1', customer: 'Original', shipper: 'Remote shipper', version: 2, archived_at: null } };
  const result = reconcileRealtimeEvent(rows, event, { rowId: '1', field: 'customer', baseValue: 'Original', baseVersion: 1 });
  assert.equal(result.rows[0].customer, 'Local edit');
  assert.equal(result.rows[0].shipper, 'Remote shipper');
  assert.equal(result.pendingRemote, null);
});

test('same-field remote edit is held as pending instead of stomping active editor', () => {
  const rows = [{ id: '1', customer: 'Local edit', shipper: 'Old', version: 1 }];
  const event = { eventType: 'UPDATE', new: { id: '1', customer: 'Remote edit', shipper: 'Remote shipper', version: 2, archived_at: null } };
  const result = reconcileRealtimeEvent(rows, event, { rowId: '1', field: 'customer', baseValue: 'Original', baseVersion: 1 });
  assert.equal(result.rows[0].customer, 'Local edit');
  assert.equal(result.rows[0].shipper, 'Remote shipper');
  assert.equal(result.pendingRemote.eventType, 'UPDATE');
  assert.equal(result.pendingRemote.new.customer, 'Remote edit');
});
