import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Relora branding appears on login, app header, dashboard, export metadata, and browser title', () => {
  const auth = read('src/components/AuthGate.jsx');
  const app = read('src/App.jsx');
  const dashboard = read('src/components/ManagementDashboard.jsx');
  const exporter = read('src/lib/exporter.js');
  const html = read('index.html');

  assert.match(auth, /auth-brand-mark">RL</);
  assert.match(auth, /SHIPMENT & CUSTOMS OPERATIONS/);
  assert.match(auth, /<h1>Relora<\/h1>/);

  assert.match(app, /className="brand">RELORA</);
  assert.match(app, /Shipment & Customs Operations/);

  assert.match(dashboard, /RELORA – FINAL MANAGEMENT REPORT/);
  assert.match(exporter, /workbook\.creator = 'Relora'/);
  assert.match(html, /<title>Relora<\/title>/);
});
