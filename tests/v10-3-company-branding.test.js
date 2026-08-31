import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v10.3 keeps Relora as the product and shows a. hartrodt as the organization on sign-in', () => {
  const auth = read('src/components/AuthGate.jsx');

  assert.match(auth, /<h1>Relora<\/h1>/);
  assert.match(auth, /a\. hartrodt/i);
  assert.match(auth, /Internal Shipment & Customs Operations/i);
});

test('v10.3 shows a. hartrodt in the authenticated header without replacing the Relora product brand', () => {
  const app = read('src/App.jsx');

  assert.match(app, /className="brand">RELORA/);
  assert.match(app, /a\. hartrodt/i);
  assert.match(app, /Internal Shipment & Customs Operations/i);
});

test('v10.3 includes dedicated organization branding styles', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.auth-organization/);
  assert.match(css, /\.topbar-organization/);
});
