import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan } from '../src/lib/importer.js';

test('same calendar date from Excel Date object does not create a stale import conflict', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-date-1',
      job_file_number: 'ENTRY-C-30771',
      eta: '2025-07-01',
      updated_at: '2026-09-01T09:30:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'ENTRY-C-30771',
      ETA: new Date(2025, 6, 1)
    }],
    headers: ['JOB FILE NUMBER', 'ETA'],
    importSnapshotAt: '2026-09-01T08:30:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 0);
  assert.equal(plan.fieldConflicts.length, 0);
  assert.equal(plan.summary.unchanged, 1);
});

test('same calendar date in a custom Excel date column does not create a stale conflict', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-date-custom-1',
      entry_no: 'C-30771',
      custom__delivery_date: '2025-07-01',
      updated_at: '2026-09-01T09:30:00.000Z'
    }],
    importedRows: [{
      'ENTRY NO.': 'C-30771',
      'DELIVERY DATE': new Date(2025, 6, 1)
    }],
    headers: ['ENTRY NO.', 'DELIVERY DATE'],
    importSnapshotAt: '2026-09-01T08:30:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 0);
  assert.equal(plan.fieldConflicts.length, 0);
  assert.equal(plan.summary.unchanged, 1);
});

test('a genuinely different imported date still requires review when Relora is newer', () => {
  const plan = buildImportPlan({
    existingRows: [{
      id: 'ship-date-2',
      job_file_number: 'ENTRY-C-30772',
      eta: '2025-07-01',
      updated_at: '2026-09-01T09:30:00.000Z'
    }],
    importedRows: [{
      'JOB FILE NUMBER': 'ENTRY-C-30772',
      ETA: new Date(2025, 6, 2)
    }],
    headers: ['JOB FILE NUMBER', 'ETA'],
    importSnapshotAt: '2026-09-01T08:30:00.000Z'
  });

  assert.equal(plan.summary.reviewConflicts, 1);
  assert.equal(plan.fieldConflicts[0].field, 'eta');
});
