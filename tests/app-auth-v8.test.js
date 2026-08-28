import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('App is protected by AuthGate and no longer exposes demo Preview as switcher', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /AuthGate/);
  assert.match(app, /loadShipments/);
  assert.match(app, /loadVisibleProfiles/);
  assert.doesNotMatch(app, /Preview as/);
  assert.doesNotMatch(app, /demoUsers/);
});

test('workspace/grid expose persistence callbacks for edits and deletes', () => {
  const workspace = fs.readFileSync(new URL('../src/components/WorkspaceView.jsx', import.meta.url), 'utf8');
  const grid = fs.readFileSync(new URL('../src/components/ShipmentGrid.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /onDeleteRows/);
  assert.match(workspace, /onImportConfirmed/);
  assert.match(grid, /onRowChanged/);
});
