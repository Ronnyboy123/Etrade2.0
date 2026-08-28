import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase-schema.sql', import.meta.url), 'utf8');

test('field save RPC cannot mutate ownership or stable identity fields', () => {
  assert.match(schema, /p_field_name in \([\s\S]*'shipment_code'[\s\S]*'assigned_user_id'[\s\S]*'assigned_to'[\s\S]*'team_id'[\s\S]*'custom_fields'/);
});

test('legacy portal write RPC is revoked after v9 migration', () => {
  assert.match(schema, /revoke all on function public\.update_portal_fields\(uuid,date,text,text\) from authenticated;/i);
});
