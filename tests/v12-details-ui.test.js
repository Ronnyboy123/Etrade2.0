import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) { return fs.readFileSync(new URL(path, import.meta.url), 'utf8'); }

test('shipment grid exposes a Details action without replacing History', () => {
  const source = read('../src/components/ShipmentGrid.jsx');
  assert.match(source, /onOpenDetails/);
  assert.match(source, />Details</);
  assert.match(source, />History</);
});

test('details drawer loads imported lines and supports search plus all-column expansion', () => {
  const source = read('../src/components/ShipmentDetailsDrawer.jsx');
  assert.match(source, /loadShipmentImportLines/);
  assert.match(source, /Search shipment details/i);
  assert.match(source, /Show all imported columns/i);
  assert.match(source, /source_sheet|Source Sheet/);
  assert.match(source, /source_section|Section/);
});

test('App owns selected shipment details drawer state', () => {
  const source = read('../src/App.jsx');
  assert.match(source, /ShipmentDetailsDrawer/);
  assert.match(source, /selected.*Detail|detailShipment/i);
});

test('WorkspaceView forwards the details action into ShipmentGrid', () => {
  const source = read('../src/components/WorkspaceView.jsx');
  assert.match(source, /onOpenDetails/);
  assert.match(source, /<ShipmentGrid[\s\S]*onOpenDetails=/);
});
