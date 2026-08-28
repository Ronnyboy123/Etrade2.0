import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRowsByIds, getSpreadsheetRowNumber } from '../src/lib/selection.js';

test('spreadsheet row number is one-based from the displayed row index', () => {
  assert.equal(getSpreadsheetRowNumber(0), 1);
  assert.equal(getSpreadsheetRowNumber(7), 8);
});

test('deleteRowsByIds removes only the selected shipments', () => {
  const rows = [
    { id: 'SHP-1', customer: 'A' },
    { id: 'SHP-2', customer: 'B' },
    { id: 'SHP-3', customer: 'C' }
  ];

  const result = deleteRowsByIds(rows, ['SHP-1', 'SHP-3']);
  assert.deepEqual(result, [{ id: 'SHP-2', customer: 'B' }]);
});

test('deleteRowsByIds leaves rows unchanged when nothing is selected', () => {
  const rows = [{ id: 'SHP-1' }];
  assert.deepEqual(deleteRowsByIds(rows, []), rows);
});
