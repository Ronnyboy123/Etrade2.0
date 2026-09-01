import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('archiving refreshes archived rows before a later import preview', () => {
  const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const handler = source.match(/async function handleArchiveRows\(ids\)\s*\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(handler, /await\s+archiveShipments\(ids\)/);
  assert.match(handler, /await\s+refreshArchived\(\)/, 'archive handler must refresh archivedRows so import preview sees the newly archived shipment');
});

test('server safely skips archived import rows unless Restore & Update was explicitly chosen', () => {
  const migration = fs.readFileSync(new URL('../relora-v10.8-migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /if\s+v_before\.archived_at\s+is\s+not\s+null/i);
  assert.match(migration, /if\s+v_intent\s*<>\s*'restore_update'[\s\S]*?continue;/i,
    'archived rows should be skipped instead of aborting the whole import batch');
  assert.doesNotMatch(migration, /Shipment % is archived\. Re-open the import preview and choose Skip or Restore & Update\./i);
});
