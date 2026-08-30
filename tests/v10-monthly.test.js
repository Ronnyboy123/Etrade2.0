import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TIME,
  currentMonthKey,
  filterRowsByMonth,
  formatMonthLabel,
  getAvailableMonthKeys,
  getOfficialShipmentMonthKey
} from '../src/lib/monthly.js';


test('numeric YYYYMM service month from brokerage workbook takes precedence over ETA', () => {
  const row = { service_month: 202608, eta: '2026-07-25' };
  assert.equal(getOfficialShipmentMonthKey(row, new Date('2026-08-31T00:00:00Z')), '2026-08');
});

test('service month is the official month even when ETA is in a different month', () => {
  const row = { service_month: 'September 2026', eta: '2026-08-31' };
  assert.equal(getOfficialShipmentMonthKey(row, new Date('2026-08-31T00:00:00Z')), '2026-09');
});

test('service month without year inherits ETA year before current year', () => {
  const row = { service_month: 'September', eta: '2027-09-03' };
  assert.equal(getOfficialShipmentMonthKey(row, new Date('2026-08-31T00:00:00Z')), '2027-09');
});

test('blank service month falls back to ETA month', () => {
  assert.equal(
    getOfficialShipmentMonthKey({ service_month: '', eta: '2026-09-10' }, new Date('2026-08-31T00:00:00Z')),
    '2026-09'
  );
});

test('upcoming September shipment is excluded from August view', () => {
  const rows = [
    { id: 'aug', service_month: 'August 2026', eta: '2026-08-25' },
    { id: 'sep', service_month: 'September 2026', eta: '2026-09-03' }
  ];
  assert.deepEqual(filterRowsByMonth(rows, '2026-08').map((row) => row.id), ['aug']);
});

test('all time returns all rows and available keys are unique chronological months', () => {
  const rows = [
    { id: '1', service_month: 'September 2026' },
    { id: '2', service_month: 'August 2026' },
    { id: '3', service_month: '', eta: '2026-09-20' }
  ];
  assert.equal(filterRowsByMonth(rows, ALL_TIME).length, 3);
  assert.deepEqual(getAvailableMonthKeys(rows, new Date('2026-08-31T00:00:00Z')), ['2026-08', '2026-09']);
});

test('current month key and labels are year aware', () => {
  assert.equal(currentMonthKey(new Date('2026-08-31T00:00:00Z')), '2026-08');
  assert.equal(formatMonthLabel('2026-08'), 'August 2026');
  assert.equal(formatMonthLabel('2027-08'), 'August 2027');
});
