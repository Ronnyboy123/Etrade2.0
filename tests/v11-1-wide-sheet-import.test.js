import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const importer = await import('../src/lib/importer.js');
const { worksheetImportRange } = importer;

test('wide corrupted worksheet range is bounded to actual populated import cells', () => {
  assert.equal(typeof worksheetImportRange, 'function');

  const worksheet = {
    '!ref': 'A1:XFD4501',
    A1: { v: 'JOB FILE NUMBER' },
    B1: { v: 'CUSTOMER' },
    C1: { v: 'DELIVERY DATE' },
    A2: { v: 'JF-001' },
    B2: { v: 'Alpha' },
    C2: { v: '2026-09-01' },
    A4501: { v: 'JF-4501' },
    C4501: { v: '2026-09-02' }
  };

  assert.equal(worksheetImportRange(worksheet), 'A1:C4501');
});

test('stray cells beyond the real header width do not expand the worksheet import range', () => {
  const worksheet = {
    '!ref': 'A1:XET1942',
    A1: { v: 'JOB FILE NUMBER' },
    B1: { v: 'CUSTOMER' },
    C1: { v: 'ETA' },
    A2: { v: 'JF-001' },
    C388: { v: '2026-09-01' },
    K1164: { v: 'orphan value' }
  };

  assert.equal(worksheetImportRange(worksheet), 'A1:C388');
});

test('normal-width worksheets keep their original range even when row 1 is sparse', () => {
  const worksheet = {
    '!ref': 'A1:U2055',
    A1: { v: 'DELIVERY SCHEDULE' },
    A2: { v: 'JF-001' },
    U2055: { v: 'Reference note' }
  };

  assert.equal(worksheetImportRange(worksheet), 'A1:U2055');
});

test('import modal passes the bounded range to SheetJS instead of trusting worksheet !ref', () => {
  const source = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');
  assert.match(source, /worksheetImportRange/);
  assert.match(source, /range:\s*worksheetImportRange\(worksheet\)/);
});

test('v11.3 package version is 1.2.0', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '1.2.0');
});
