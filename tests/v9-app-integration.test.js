import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
let syncStatus = '';
try { syncStatus = await readFile(new URL('../src/components/SyncStatus.jsx', import.meta.url), 'utf8'); } catch {}
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('app shell wires realtime, save state, conflict resolution, archive, restore and activity history', () => {
  assert.match(app, /subscribeToShipmentChanges/);
  assert.match(app, /reconcileRealtimeEvent/);
  assert.match(app, /SyncStatus/);
  assert.match(app, /ShipmentConflictError/);
  assert.match(app, /ConflictDialog/);
  assert.match(app, /ArchivedView/);
  assert.match(app, /ActivityPanel/);
  assert.match(app, /archiveShipments/);
  assert.match(app, /restoreShipments/);
  assert.match(app, /permanentlyDeleteShipments/);
  assert.match(app, /loadShipmentActivity/);
  assert.match(app, /onArchiveRows/);
  assert.match(app, /onEditingChange/);
  assert.match(app, /onOpenActivity/);
  assert.match(app, /force:\s*true/);
});

test('sync status component exposes all v9 connectivity states', () => {
  assert.match(syncStatus, /syncStateLabel/);
  assert.match(syncStatus, /Saving/);
  assert.match(syncStatus, /Offline/);
  assert.match(syncStatus, /Sync issue/);
});

test('package remains the Relora application package', () => {
  assert.equal(packageJson.name, 'relora');
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
});
