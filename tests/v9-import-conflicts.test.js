import test from 'node:test';
import assert from 'node:assert/strict';
import * as importer from '../src/lib/importer.js';
const { buildImportPlan } = importer;

test('server-newer differing field requires review and keeps Relora value until resolved', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-1',
      job_file_number: 'JF-001',
      customer: 'Newest Relora Customer',
      updated_at: '2026-08-28T10:00:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'JF-001',
      CUSTOMER: 'Older Excel Customer'
    }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    importSnapshotAt: '2026-08-27T10:00:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 1);
  assert.equal(plan.fieldConflicts.length, 1);
  assert.equal(plan.fieldConflicts[0].field, 'customer');
  assert.match(plan.fieldConflicts[0].reason, /changed after this file/i);
  assert.equal(plan.finalRows.find((row) => row.id === 'ship-1').customer, 'Newest Relora Customer');
});

test('blank imported values never erase existing Relora values', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-1',
      job_file_number: 'JF-001',
      customer: 'Keep Me',
      updated_at: '2026-08-28T10:00:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'JF-001',
      CUSTOMER: ''
    }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    importSnapshotAt: '2026-08-27T10:00:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 0);
  assert.equal(plan.summary.safeUpdates, 0);
  assert.equal(plan.summary.unchanged, 1);
  assert.equal(plan.finalRows.find((row) => row.id === 'ship-1').customer, 'Keep Me');
});

test('reviewer can explicitly choose imported value for a stale conflict', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-1',
      job_file_number: 'JF-001',
      customer: 'Newest Relora Customer',
      updated_at: '2026-08-28T10:00:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'JF-001',
      CUSTOMER: 'Older Excel Customer'
    }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    importSnapshotAt: '2026-08-27T10:00:00.000Z'
  });

  const conflictId = plan.fieldConflicts[0].id;
  const resolved = importer.resolveImportConflicts(plan, { [conflictId]: 'import' });

  assert.equal(resolved.unresolvedConflicts, 0);
  assert.equal(resolved.finalRows.find((row) => row.id === 'ship-1').customer, 'Older Excel Customer');
});

test('workflow regression is reviewable even when file timestamp is not older', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-1',
      job_file_number: 'JF-001',
      boc_status: 'RELEASED',
      releasing_date: '2026-08-28',
      updated_at: '2026-08-27T10:00:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'JF-001',
      'BOC STATUS': 'PAID'
    }],
    headers: ['JOB FILE NUMBER', 'BOC STATUS'],
    importSnapshotAt: '2026-08-28T10:00:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 1);
  assert.equal(plan.fieldConflicts[0].field, 'boc_status');
  assert.match(plan.fieldConflicts[0].reason, /workflow/i);
});
