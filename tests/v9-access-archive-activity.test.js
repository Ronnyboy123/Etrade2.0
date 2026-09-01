import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewActivity,
  canArchiveRows,
  canRestoreRows,
  canPermanentlyDeleteRows
} from '../src/lib/access.js';

test('v9 activity history is limited to team leads, managers and admins', () => {
  assert.equal(canViewActivity({ role: 'team_lead' }), true);
  assert.equal(canViewActivity({ role: 'manager' }), true);
  assert.equal(canViewActivity({ role: 'admin' }), true);
  assert.equal(canViewActivity({ role: 'assistant_manager' }), false);
  assert.equal(canViewActivity({ role: 'employee' }), false);
  assert.equal(canViewActivity({ role: 'portal' }), false);
});

test('v10.5 archive and restore allow employees plus leadership, while permanent delete is admin only', () => {
  for (const role of ['employee', 'team_lead', 'manager', 'admin']) {
    assert.equal(canArchiveRows({ role }), true, role);
    assert.equal(canRestoreRows({ role }), true, role);
  }
  for (const role of ['assistant_manager', 'portal']) {
    assert.equal(canArchiveRows({ role }), false, role);
    assert.equal(canRestoreRows({ role }), false, role);
  }
  assert.equal(canPermanentlyDeleteRows({ role: 'manager' }), false);
  assert.equal(canPermanentlyDeleteRows({ role: 'team_lead' }), false);
  assert.equal(canPermanentlyDeleteRows({ role: 'admin' }), true);
});
