import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canBulkSelectAll } from '../src/lib/access.js';

test('only manager and admin receive the explicit bulk select-all-results action', () => {
  assert.equal(canBulkSelectAll({ role: 'manager' }), true);
  assert.equal(canBulkSelectAll({ role: 'admin' }), true);
  assert.equal(canBulkSelectAll({ role: 'assistant_manager' }), false);
  assert.equal(canBulkSelectAll({ role: 'team_lead' }), false);
  assert.equal(canBulkSelectAll({ role: 'employee' }), false);
});

test('workspace bulk action selects current displayed results and archives them', () => {
  const source = fs.readFileSync(new URL('../src/components/WorkspaceView.jsx', import.meta.url), 'utf8');
  assert.match(source, /Select all .*results/);
  assert.match(source, /setSelectedIds\(displayedIds\)/);
  assert.match(source, /Archive Selected/);
  assert.doesNotMatch(source, /Permanently Delete Selected/);
});

test('selection resets when reporting month or search scope changes', () => {
  const workspace = fs.readFileSync(new URL('../src/components/WorkspaceView.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /selectionScopeKey/);
  assert.match(workspace, /setSelectedIds\(\[\]\)/);
  assert.match(app, /selectionScopeKey=/);
  assert.match(app, /selectedMonth/);
});
