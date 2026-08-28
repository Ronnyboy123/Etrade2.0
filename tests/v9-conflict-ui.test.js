import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const grid = await readFile(new URL('../src/components/ShipmentGrid.jsx', import.meta.url), 'utf8');
let dialog = '';
try { dialog = await readFile(new URL('../src/components/ConflictDialog.jsx', import.meta.url), 'utf8'); } catch {}

test('grid captures edit base version/value and passes edit context to save callback', () => {
  assert.match(grid, /onCellEditingStarted/);
  assert.match(grid, /baseVersion/);
  assert.match(grid, /baseValue/);
  assert.match(grid, /onEditingChange/);
  assert.match(grid, /onRowChanged\(automated,\s*event\.colDef\?\.field\s*\|\|\s*'',\s*editContext\)/);
});

test('conflict dialog offers explicit server or user resolution', () => {
  assert.match(dialog, /Keep Server Value/);
  assert.match(dialog, /Use My Value/);
  assert.match(dialog, /changed elsewhere/i);
});
