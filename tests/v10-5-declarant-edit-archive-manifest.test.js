import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as access from '../src/lib/access.js';
import { AUTOMATED_FIELDS, FIELD_DEFINITIONS } from '../src/lib/importer.js';

test('employee role is allowed to use archive actions', () => {
  assert.equal(access.canArchiveRows({ role: 'employee' }), true);
});

test('access layer exposes row-level archive authorization', () => {
  assert.equal(typeof access.canArchiveRow, 'function');
});



test('employee may archive only their own assigned shipment', () => {
  const user = { id: 'user-1', role: 'employee', declarantName: 'Andrea' };
  assert.equal(access.canArchiveRow(user, { id: '1', assigned_user_id: 'user-1', assigned_to: 'Someone Else' }), true);
  assert.equal(access.canArchiveRow(user, { id: '2', assigned_to: 'Andrea' }), true);
  assert.equal(access.canArchiveRow(user, { id: '3', assigned_user_id: 'user-2', assigned_to: 'Philip' }), false);
});

test('employee can edit operational fields only on their own assigned shipment', () => {
  const user = { id: 'user-1', role: 'employee', declarantName: 'Andrea' };
  const own = { id: '1', assigned_user_id: 'user-1', assigned_to: 'Andrea' };
  const other = { id: '2', assigned_user_id: 'user-2', assigned_to: 'Philip' };
  for (const field of ['validated_manifest_date', 'customer', 'lodgement', 'portal_submission', 'received_folder', 'custom__note']) {
    assert.equal(access.canEditField(user, field, own), true, field);
    assert.equal(access.canEditField(user, field, other), false, field);
  }
});

test('validated manifest date is an operational customs field, not an automated field', () => {
  assert.equal(AUTOMATED_FIELDS.includes('validated_manifest_date'), false);
  assert.equal(FIELD_DEFINITIONS.validated_manifest_date?.group, 'customs');
});

test('validated manifest date uses a date-string editor in the shipment grid', () => {
  const source = fs.readFileSync(new URL('../src/components/ShipmentGrid.jsx', import.meta.url), 'utf8');
  assert.match(source, /agDateStringCellEditor/);
});

test('database archive function includes employee own-assignment authorization', () => {
  const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('create or replace function public.archive_shipments');
  const end = schema.indexOf('create or replace function public.restore_shipments', start);
  const fn = schema.slice(start, end);
  assert.match(fn, /v_role\s+not\s+in\s+\('employee','team_lead','manager','admin'\)/i);
  assert.match(fn, /v_row\.assigned_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(fn, /current_user_declarant_name\(\)/i);
});


test('v10.5 migration applies the same employee own-assignment rule to archive and restore', () => {
  const migration = fs.readFileSync(new URL('../relora-v10.5-migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /create or replace function public\.archive_shipments/i);
  assert.match(migration, /create or replace function public\.restore_shipments/i);
  assert.match(migration, /not assigned to you/i);
  assert.match(migration, /assigned_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /current_user_declarant_name\(\)/i);
});

test('validated manifest remains searchable even when an older saved layout did not include it', async () => {
  const { getSearchableColumns } = await import('../src/lib/search.js');
  const fields = getSearchableColumns({ displayOrder: ['customer'], columns: [] }).map((column) => column.field);
  assert.equal(fields.includes('validated_manifest_date'), true);
});

test('default Excel export keeps validated manifest date after it became operational', async () => {
  const { buildFormattedExportSpec } = await import('../src/lib/exporter.js');
  const spec = buildFormattedExportSpec([{ validated_manifest_date: '2026-09-01' }]);
  assert.equal(spec.columns.some((column) => column.field === 'validated_manifest_date'), true);
});

test('workspace export injects validated manifest date into older imported layouts', () => {
  const source = fs.readFileSync(new URL('../src/components/WorkspaceView.jsx', import.meta.url), 'utf8');
  assert.match(source, /validated_manifest_date/);
});
