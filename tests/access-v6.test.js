import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessMaster,
  canAccessTeamWorkspaces,
  canEditField,
  getVisibleRowsForUser,
  getAccessibleWorkers
} from '../src/lib/access.js';

const rows = [
  { id: '1', assigned_to: 'Ella', team_id: 'team1' },
  { id: '2', assigned_to: 'Andrea', team_id: 'team2' },
  { id: '3', assigned_to: 'Philip', team_id: 'team2' }
];

const workers = [
  { id: 'ella', declarantName: 'Ella', teamId: 'team1' },
  { id: 'andrea', declarantName: 'Andrea', teamId: 'team2' }
];

test('team lead sees only shipments from their team', () => {
  const tl1 = { role: 'team_lead', teamId: 'team1' };
  assert.deepEqual(getVisibleRowsForUser(rows, tl1).map((r) => r.id), ['1']);
});

test('assistant manager and manager can access master while team leads cannot', () => {
  assert.equal(canAccessMaster({ role: 'manager' }), true);
  assert.equal(canAccessMaster({ role: 'assistant_manager' }), true);
  assert.equal(canAccessMaster({ role: 'team_lead' }), false);
});

test('portal users can access master but only edit portal fields', () => {
  const portal = { role: 'portal' };
  assert.equal(canAccessMaster(portal), true);
  assert.equal(canEditField(portal, 'portal_submission', rows[0]), true);
  assert.equal(canEditField(portal, 'broker_representative', rows[0]), true);
  assert.equal(canEditField(portal, 'portal_ticket_efile', rows[0]), true);
  assert.equal(canEditField(portal, 'customer', rows[0]), false);
  assert.equal(canEditField(portal, 'received_folder', rows[0]), false);
});

test('team lead can open team workspaces and only receives workers from their team', () => {
  const tl1 = { role: 'team_lead', teamId: 'team1' };
  assert.equal(canAccessTeamWorkspaces(tl1), true);
  assert.deepEqual(getAccessibleWorkers(workers, tl1).map((w) => w.id), ['ella']);
});
