import test from 'node:test';
import assert from 'node:assert/strict';
import { profileToAppUser, resolveProfileAccess, roleLabel } from '../src/lib/auth.js';

test('profileToAppUser maps Supabase profile fields to existing app user shape', () => {
  const user = profileToAppUser({
    id: 'u1',
    email: 'andrea@example.com',
    full_name: 'Andrea Cruz',
    role: 'employee',
    declarant_name: 'Andrea',
    team_id: 'team2'
  });

  assert.deepEqual(user, {
    id: 'u1',
    email: 'andrea@example.com',
    name: 'Andrea Cruz',
    role: 'employee',
    declarantName: 'Andrea',
    teamId: 'team2',
    teamName: 'Team 2'
  });
});

test('resolveProfileAccess denies missing or inactive profiles and allows active profile', () => {
  assert.deepEqual(resolveProfileAccess(null), { allowed: false, reason: 'not-approved' });
  assert.deepEqual(resolveProfileAccess({ id: 'u1', is_active: false }), { allowed: false, reason: 'inactive' });
  assert.deepEqual(resolveProfileAccess({ id: 'u1', is_active: true }), { allowed: true, reason: '' });
});

test('roleLabel uses readable operations labels', () => {
  assert.equal(roleLabel('employee'), 'Customs Declarant');
  assert.equal(roleLabel('portal'), 'Portal / Broker');
  assert.equal(roleLabel('assistant_manager'), 'Assistant Manager');
});
