import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleSelectedId,
  toggleAllVisibleIds,
  getSelectionState
} from '../src/lib/selection.js';

test('row checkbox toggles one selected shipment id', () => {
  assert.deepEqual(toggleSelectedId([], 'A'), ['A']);
  assert.deepEqual(toggleSelectedId(['A', 'B'], 'A'), ['B']);
});

test('select all only selects the visible filtered shipment ids', () => {
  assert.deepEqual(toggleAllVisibleIds(['X'], ['A', 'B'], true).sort(), ['A', 'B', 'X']);
  assert.deepEqual(toggleAllVisibleIds(['X', 'A', 'B'], ['A', 'B'], false), ['X']);
});

test('header checkbox exposes checked and indeterminate state', () => {
  assert.deepEqual(getSelectionState(['A', 'B'], ['A', 'B']), { checked: true, indeterminate: false });
  assert.deepEqual(getSelectionState(['A'], ['A', 'B']), { checked: false, indeterminate: true });
  assert.deepEqual(getSelectionState([], ['A', 'B']), { checked: false, indeterminate: false });
});
