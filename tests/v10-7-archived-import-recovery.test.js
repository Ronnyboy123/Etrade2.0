import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildImportPlan, resolveImportReview } from '../src/lib/importer.js';
import { prepareImportPayloads } from '../src/lib/dataApi.js';

test('import preview recognizes an archived shipment instead of treating it as new', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'arch-1',
      shipment_code: '894-26-01996-894144',
      job_file_number: '894-26-01996-894144',
      customer: 'Existing Customer',
      assigned_to: 'Ella',
      archived_at: '2026-09-01T02:09:51Z',
      version: 2
    }],
    importedRows: [{
      'JOB FILE NUMBER': '894-26-01996-894144',
      CUSTOMER: 'Updated Customer'
    }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    assignedTo: 'Ella'
  });

  assert.equal(plan.summary.created, 0);
  assert.equal(plan.summary.archivedMatches, 1);
  assert.equal(plan.archivedConflicts.length, 1);
  assert.equal(plan.changes[0].type, 'archived_match');
  assert.match(plan.archivedConflicts[0].reason, /archived shipment already exists/i);
});

test('archived shipment defaults to skip and can explicitly restore and update', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'arch-1',
      shipment_code: 'JF-ARCH',
      job_file_number: 'JF-ARCH',
      customer: 'Old Customer',
      assigned_to: 'Ella',
      archived_at: '2026-09-01T02:09:51Z',
      version: 7
    }],
    importedRows: [{ 'JOB FILE NUMBER': 'JF-ARCH', CUSTOMER: 'Imported Customer' }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    assignedTo: 'Ella'
  });

  const skipped = resolveImportReview(plan);
  assert.equal(skipped.changes[0].type, 'skip');
  assert.equal(prepareImportPayloads(skipped.changes).length, 0);

  const conflictId = plan.archivedConflicts[0].id;
  const restored = resolveImportReview(plan, {}, { [conflictId]: 'restore_update' });
  assert.equal(restored.changes[0].type, 'restore_update');
  assert.equal(restored.changes[0].row.customer, 'Imported Customer');
  const payloads = prepareImportPayloads(restored.changes);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0]._relora_import_intent, 'restore_update');
  assert.equal(payloads[0]._relora_expected_version, 7);
});

test('v10.7 migration supports employee own archive and import restore-update', () => {
  const migration = fs.readFileSync(new URL('../relora-v10.7-migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /v_role\s+not\s+in\s+\('employee','team_lead','manager','admin'\)/i);
  assert.match(migration, /assigned_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /v_intent\s*=\s*'restore_update'/i);
  assert.match(migration, /archived_at\s*=\s*null/i);
  assert.match(migration, /import_restore_update/i);
});

test('import UI offers Skip and Restore & Update for archived matches', () => {
  const source = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');
  assert.match(source, /Archived shipment already exists/i);
  assert.match(source, /Restore & Update/i);
  assert.match(source, /Skip/i);
});

test('app includes archived rows in import review data', () => {
  const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /allRows=\{\[\.\.\.rows,\s*\.\.\.archivedRows\]\}/);
});
