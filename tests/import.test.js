import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapImportedHeaders,
  buildImportPlan,
  AUTOMATED_FIELDS
} from '../src/lib/importer.js';

test('maps common shipment headers and preserves imported column order', () => {
  const headers = ['CUSTOMER', 'ETA', 'JOB FILE NUMBER', 'PORT OF ENTRY', 'SPECIAL REMARKS'];
  const result = mapImportedHeaders(headers);

  assert.deepEqual(result.displayOrder, [
    'customer',
    'eta',
    'job_file_number',
    'port_of_entry',
    'custom__special_remarks'
  ]);
  assert.equal(result.columns[0].field, 'customer');
  assert.equal(result.columns[4].isCustom, true);
});

test('automated status fields are excluded from imported display order because they stay first', () => {
  const headers = ['CURRENT STAGE', 'CUSTOMER', 'COMPLETION %', 'ETA'];
  const result = mapImportedHeaders(headers);

  assert.deepEqual(result.displayOrder, ['customer', 'eta']);
  assert.ok(AUTOMATED_FIELDS.includes('current_stage'));
  assert.ok(AUTOMATED_FIELDS.includes('completion'));
});

test('buildImportPlan updates existing shipment instead of duplicating it', () => {
  const existingRows = [
    {
      id: 'SHP-1',
      assigned_to: 'Andrea',
      job_file_number: 'JF-001',
      customer: 'Old Customer',
      eta: '2026-08-20'
    }
  ];

  const importedRows = [
    {
      'JOB FILE NUMBER': 'JF-001',
      CUSTOMER: 'Updated Customer',
      ETA: '2026-08-28'
    },
    {
      'JOB FILE NUMBER': 'JF-002',
      CUSTOMER: 'New Customer',
      ETA: '2026-09-01'
    }
  ];

  const plan = buildImportPlan({
    existingRows,
    importedRows,
    headers: ['JOB FILE NUMBER', 'CUSTOMER', 'ETA'],
    assignedTo: 'Andrea'
  });

  assert.equal(plan.summary.updated, 1);
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.summary.duplicates, 0);
  assert.equal(plan.finalRows.length, 2);
  assert.equal(plan.finalRows.find((r) => r.job_file_number === 'JF-001').customer, 'Updated Customer');
  assert.equal(plan.finalRows.find((r) => r.job_file_number === 'JF-002').assigned_to, 'Andrea');
});

test('does not overwrite a shipment assigned to another employee', () => {
  const existingRows = [
    { id: 'SHP-1', assigned_to: 'Michael', job_file_number: 'JF-009', customer: 'Michael Client' }
  ];

  const plan = buildImportPlan({
    existingRows,
    importedRows: [{ 'JOB FILE NUMBER': 'JF-009', CUSTOMER: 'Andrea Client' }],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    assignedTo: 'Andrea'
  });

  assert.equal(plan.summary.conflicts, 1);
  assert.equal(plan.summary.updated, 0);
  assert.equal(plan.finalRows[0].customer, 'Michael Client');
  assert.equal(plan.finalRows[0].assigned_to, 'Michael');
});

test('creating a new row before an update does not shift the target existing row', () => {
  const existingRows = [
    { id: 'SHP-A', assigned_to: 'Andrea', job_file_number: 'JF-A', customer: 'Existing A' },
    { id: 'SHP-B', assigned_to: 'Andrea', job_file_number: 'JF-B', customer: 'Existing B' }
  ];

  const plan = buildImportPlan({
    existingRows,
    importedRows: [
      { 'JOB FILE NUMBER': 'JF-NEW', CUSTOMER: 'New Row' },
      { 'JOB FILE NUMBER': 'JF-B', CUSTOMER: 'Updated B' }
    ],
    headers: ['JOB FILE NUMBER', 'CUSTOMER'],
    assignedTo: 'Andrea'
  });

  assert.equal(plan.finalRows.find((r) => r.id === 'SHP-B').customer, 'Updated B');
  assert.equal(plan.finalRows.find((r) => r.id === 'SHP-A').customer, 'Existing A');
});

test('generic TBA job file number does not make separate shipments collide', () => {
  const existingRows = [
    { id: 'SHP-1', assigned_to: 'Andrea', job_file_number: 'TBA', house_awb_bl: 'HBL-ONE', customer: 'One' }
  ];

  const plan = buildImportPlan({
    existingRows,
    importedRows: [
      { 'JOB FILE NUMBER': 'TBA', 'HOUSE AWB / BL NO.': 'HBL-TWO', CUSTOMER: 'Two' }
    ],
    headers: ['JOB FILE NUMBER', 'HOUSE AWB / BL NO.', 'CUSTOMER'],
    assignedTo: 'Andrea'
  });

  assert.equal(plan.summary.updated, 0);
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.finalRows.length, 2);
});

test('shared master BL does not merge two shipments when house BLs are different', () => {
  const existingRows = [
    { id: 'SHP-1', assigned_to: 'Andrea', job_file_number: 'TBA', house_awb_bl: 'HBL-ONE', master_awb_bl: 'MBL-SHARED', customer: 'One' }
  ];

  const plan = buildImportPlan({
    existingRows,
    importedRows: [
      { 'JOB FILE NUMBER': 'TBA', 'HOUSE AWB / BL NO.': 'HBL-TWO', 'MASTER AWB / BL NO.': 'MBL-SHARED', CUSTOMER: 'Two' }
    ],
    headers: ['JOB FILE NUMBER', 'HOUSE AWB / BL NO.', 'MASTER AWB / BL NO.', 'CUSTOMER'],
    assignedTo: 'Andrea'
  });

  assert.equal(plan.summary.updated, 0);
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.finalRows.length, 2);
});
