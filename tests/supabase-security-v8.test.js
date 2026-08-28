import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Supabase schema includes approved-user gate, auth trigger, custom fields, helper functions and RLS', () => {
  const sql = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8').toLowerCase();
  assert.match(sql, /create table if not exists public\.approved_users/);
  assert.match(sql, /custom_fields\s+jsonb/);
  assert.match(sql, /handle_new_auth_user/);
  assert.match(sql, /on_auth_user_created/);
  assert.match(sql, /current_user_role/);
  assert.match(sql, /current_user_team_id/);
  assert.match(sql, /current_user_declarant_name/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /update_portal_fields/);
});
