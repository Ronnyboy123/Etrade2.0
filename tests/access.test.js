import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisibleRowsForUser, canViewManagement } from '../src/lib/access.js';

const rows = [
  { id: '1', assigned_to: 'Andrea' },
  { id: '2', assigned_to: 'Michael' },
  { id: '3', customs_declarant: 'Andrea' }
];

test('employee only sees shipments assigned to them', () => {
  const user = { role: 'employee', declarantName: 'Andrea' };
  assert.deepEqual(getVisibleRowsForUser(rows, user).map((r) => r.id), ['1', '3']);
});

test('manager sees all shipments', () => {
  const user = { role: 'manager', declarantName: 'Manager' };
  assert.equal(getVisibleRowsForUser(rows, user).length, 3);
});

test('only manager/admin can view management pages', () => {
  assert.equal(canViewManagement({ role: 'employee' }), false);
  assert.equal(canViewManagement({ role: 'manager' }), true);
  assert.equal(canViewManagement({ role: 'admin' }), true);
});
