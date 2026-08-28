import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('v9 schema adds versioning, archive metadata, richer activity data and realtime publication', () => {
  assert.match(schema, /version\s+bigint\s+not null\s+default\s+1/i);
  assert.match(schema, /archived_at\s+timestamptz/i);
  assert.match(schema, /archived_by\s+uuid/i);
  assert.match(schema, /action_type\s+text/i);
  assert.match(schema, /actor_email\s+text/i);
  assert.match(schema, /supabase_realtime/i);
});

test('v9 schema exposes explicit write RPCs and restricts permanent deletion to admin', () => {
  assert.match(schema, /create or replace function public\.create_shipment/i);
  assert.match(schema, /create or replace function public\.update_shipment_field/i);
  assert.match(schema, /create or replace function public\.archive_shipments/i);
  assert.match(schema, /create or replace function public\.restore_shipments/i);
  assert.match(schema, /create or replace function public\.admin_delete_shipments/i);
  assert.match(schema, /create or replace function public\.persist_import_batch/i);
  assert.match(schema, /current_user_role\(\)\s*<>\s*'admin'/i);
  assert.match(schema, /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.shipments\s+from\s+authenticated/i);
});

test('activity RLS grants leadership read but not assistant manager read', () => {
  assert.match(schema, /shipment activity read access/i);
  assert.match(schema, /'team_lead','manager','admin'/i);
});

test('different-field concurrent saves do not apply stale derived workflow fields', () => {
  assert.match(schema, /if coalesce\(v_before\.version,\s*1\) = coalesce\(p_base_version,\s*1\) then[\s\S]*jsonb_each\(coalesce\(p_derived/);
  assert.match(schema, /else\s+v_safe_derived := '\{\}'::jsonb;\s+end if;/);
});
