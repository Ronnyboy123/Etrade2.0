import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRowsByKpi } from '../src/lib/dashboardFilters.js';

const rows = [
  { id: '1', overall_status: 'ON TRACK' },
  { id: '2', overall_status: 'ACTION DUE' },
  { id: '3', overall_status: 'DELAYED' },
  { id: '4', overall_status: 'CLOSED' }
];

test('dashboard KPI filters return the list behind the card', () => {
  assert.equal(filterRowsByKpi(rows, 'total').length, 4);
  assert.deepEqual(filterRowsByKpi(rows, 'delayed').map((r) => r.id), ['3']);
  assert.deepEqual(filterRowsByKpi(rows, 'open').map((r) => r.id), ['1', '2', '3']);
});
