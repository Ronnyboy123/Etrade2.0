import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('v12 migration creates shipment_import_lines with deterministic uniqueness and cascade', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /create table if not exists public\.shipment_import_lines/i);
  assert.match(sql, /shipment_id uuid not null references public\.shipments\(id\) on delete cascade/i);
  assert.match(sql, /raw_cells jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql, /normalized_fields jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /unique\s*\(shipment_id,\s*line_key\)/i);
});

test('detail table is SELECT-only for authenticated clients and protected by parent visibility RLS', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /alter table public\.shipment_import_lines enable row level security/i);
  assert.match(sql, /create policy "shipment import lines read access"/i);
  assert.match(sql, /exists\s*\(\s*select 1\s*from public\.shipments/i);
  assert.match(sql, /grant select on public\.shipment_import_lines to authenticated/i);
  assert.match(sql, /revoke insert, update, delete on public\.shipment_import_lines from authenticated/i);
});

test('group RPC exact-syncs detail rows inside the shipment transaction and explicitly safe-skips archived groups', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /create or replace function public\.persist_import_group_batch\(p_groups jsonb\)/i);
  assert.match(sql, /insert into public\.shipment_import_lines/i);
  assert.match(sql, /on conflict \(shipment_id, line_key\) do update/i);
  assert.match(sql, /delete from public\.shipment_import_lines/i);
  assert.match(sql, /archived_at is not null[\s\S]{0,500}continue;/i);
  assert.match(sql, /shipment_detail_count/i);
});

test('migration does not rewrite or delete existing shipment masters', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.doesNotMatch(sql, /delete\s+from\s+public\.shipments/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /update\s+public\.shipments\s+set\s+shipment_code/i);
});

test('Relora v12.0 package version is 1.2.0', () => {
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.version, '1.2.0');
});
