import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGroupedImportPlan, resolveGroupedImportReview } from '../src/lib/importer.js';

const group = (overrides = {}) => ({
  groupKey: 'house:HBL-1',
  shipmentCodeHint: 'HBL-1',
  masterRow: { id: 'IMPORT-1', assigned_to: 'Ella', house_awb_bl: 'HBL-1', customer: 'Customer A' },
  details: [
    { line_key: 'line-a:1', source_sheet: 'INCOMING', raw_cells: [{ header: 'MATERIAL', value: 'A' }], normalized_fields: { material: 'A' } },
    { line_key: 'line-b:1', source_sheet: 'INCOMING', raw_cells: [{ header: 'MATERIAL', value: 'B' }], normalized_fields: { material: 'B' } }
  ],
  masterConflicts: [], sourceSheets: ['INCOMING'], ...overrides
});

test('one grouped shipment produces one master change with all details', () => {
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [], groups: [group()] });
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].group.details.length, 2);
  assert.equal(plan.summary.detailRows, 2);
});

test('mixed master values require review before commit', () => {
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [], groups: [group({ masterConflicts: [{ field: 'customer', label: 'Customer', values: ['A', 'B'] }] })] });
  assert.equal(plan.masterConflicts.length, 1);
  assert.equal(plan.changes[0].type, 'needs_review');
  const resolved = resolveGroupedImportReview(plan, { [plan.masterConflicts[0].id]: 'value:1' });
  assert.equal(resolved.unresolvedConflicts, 0);
  assert.equal(resolved.changes[0].row.customer, 'B');
});

test('archived group stays archived unless Restore & Update is selected', () => {
  const archived = { id: 'SHP-1', shipment_code: 'BL-HBL-1', house_awb_bl: 'HBL-1', assigned_to: 'Ella', archived_at: '2026-08-01T00:00:00Z', version: 2 };
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [archived], groups: [group()] });
  assert.equal(plan.archivedConflicts.length, 1);
  assert.equal(plan.changes[0].type, 'archived_match');
  const skipped = resolveGroupedImportReview(plan, {}, {});
  assert.equal(skipped.changes[0].type, 'skip');
  const restored = resolveGroupedImportReview(plan, {}, { [plan.archivedConflicts[0].id]: 'restore_update' });
  assert.equal(restored.changes[0].type, 'restore_update');
});

test('same shipment group is never counted as duplicate selected-sheet shipments', () => {
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [], groups: [group()] });
  assert.equal(plan.summary.duplicates, 0);
  assert.ok(plan.rowTrace.every((trace) => trace.result !== 'Duplicate in selected sheets'));
});

test('detail changes turn a matched group into an update even when master is unchanged', () => {
  const existing = { id: 'SHP-1', shipment_code: 'BL-HBL-1', house_awb_bl: 'HBL-1', assigned_to: 'Ella', customer: 'Customer A', version: 1 };
  const oldDetails = [{ line_key: 'old:1', raw_cells: [], normalized_fields: {} }];
  const plan = buildGroupedImportPlan({ existingRows: [existing], groups: [group()], existingDetailsByShipmentId: new Map([['SHP-1', oldDetails]]) });
  assert.equal(plan.changes[0].type, 'update');
  assert.equal(plan.summary.safeUpdates, 1);
  assert.equal(plan.changes[0].detailDiff.removed, 1);
});

test('import modal reviews shipment groups instead of selected-sheet duplicate rows', () => {
  const modalSource = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');
  assert.match(modalSource, /Shipment groups|shipment group/i);
  assert.match(modalSource, /Detail rows/i);
  assert.match(modalSource, /will be added/i);
  assert.match(modalSource, /will change/i);
  assert.match(modalSource, /will be removed/i);
  assert.doesNotMatch(modalSource, /Duplicate in selected sheets/);
});
