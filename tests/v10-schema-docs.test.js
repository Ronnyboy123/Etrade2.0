import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Relora package is version 1.1.0', () => {
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.version, '1.1.0');
});

test('schema stays approved-user/RLS based and does not store account passwords', () => {
  const sql = read('../supabase-schema.sql');
  const approvedBlock = sql.match(/create table if not exists public\.approved_users \([\s\S]*?\n\);/)?.[0] || '';
  assert.match(sql, /claim_approved_profile/);
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(approvedBlock, /password/i);
  assert.doesNotMatch(sql, /Google-only login/i);
});

test('README documents password login, admin-provisioned credentials, monthly reporting and bulk archive behavior', () => {
  const readme = read('../README.md');
  assert.match(readme, /email \+ password/i);
  assert.match(readme, /temporary password|provided password/i);
  assert.match(readme, /no Forgot Password/i);
  assert.match(readme, /Service Month/i);
  assert.match(readme, /fallback.*ETA/i);
  assert.match(readme, /September.*not.*August/i);
  assert.match(readme, /Select all results/i);
  assert.match(readme, /Admin.*permanent/i);
  assert.doesNotMatch(readme, /Enable Google provider/i);
});

test('v10 migration adds safe month-query indexes without changing existing shipment data', () => {
  const migration = read('../relora-v10-migration.sql');
  assert.match(migration, /create index if not exists shipments_service_month_idx/i);
  assert.match(migration, /create index if not exists shipments_eta_idx/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.shipments/i);
  assert.doesNotMatch(migration, /truncate/i);
});
