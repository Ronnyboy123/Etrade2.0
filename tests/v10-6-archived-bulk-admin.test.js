import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const archivedSource = fs.readFileSync(new URL('../src/components/ArchivedView.jsx', import.meta.url), 'utf8');

test('archived admin view exposes select-all and bulk restore/delete actions', () => {
  assert.match(archivedSource, /Select all archived shipments shown/i);
  assert.match(archivedSource, /Restore Selected/);
  assert.match(archivedSource, /Delete Permanently Selected/);
  assert.match(archivedSource, /Selected:\s*\{selectedIds\.length\}/);
});

test('archived bulk selection is restricted to admin via permanent-delete permission', () => {
  assert.match(archivedSource, /allowBulkSelection\s*=\s*allowPermanentDelete/);
  assert.match(archivedSource, /\{allowBulkSelection\s*&&\s*<th/);
});

test('select all targets only rows currently passed to the archived view and selection resets when scope changes', () => {
  assert.match(archivedSource, /const displayedIds\s*=\s*rows\.map/);
  assert.match(archivedSource, /setSelectedIds\(displayedIds\)/);
  assert.match(archivedSource, /selectionScopeKey/);
  assert.match(archivedSource, /setSelectedIds\(\[\]\)/);
});

test('bulk permanent delete uses one confirmation for the selected shipment count', () => {
  assert.match(archivedSource, /Permanently delete \$\{selectedIds\.length\} selected shipments\?/);
  assert.match(archivedSource, /onPermanentDelete\?\.\(selectedIds\)/);
});
