import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workspace = await readFile(new URL('../src/components/WorkspaceView.jsx', import.meta.url), 'utf8');
let archived = '';
let activity = '';
try { archived = await readFile(new URL('../src/components/ArchivedView.jsx', import.meta.url), 'utf8'); } catch {}
try { activity = await readFile(new URL('../src/components/ActivityPanel.jsx', import.meta.url), 'utf8'); } catch {}

const grid = await readFile(new URL('../src/components/ShipmentGrid.jsx', import.meta.url), 'utf8');

test('active workspace archives instead of permanently deleting', () => {
  assert.match(workspace, /Archive Selected/);
  assert.doesNotMatch(workspace, /> Delete Selected</);
  assert.match(workspace, /canArchiveRows/);
});

test('archived view exposes restore and admin-only permanent delete controls', () => {
  assert.match(archived, /Restore/);
  assert.match(archived, /Delete Permanently/);
  assert.match(archived, /canPermanentlyDeleteRows/);
});

test('activity history has a leadership drawer and grid history action', () => {
  assert.match(activity, /Activity History/);
  assert.match(activity, /actor_name/);
  assert.match(grid, /onOpenActivity/);
  assert.match(grid, /History/);
});
