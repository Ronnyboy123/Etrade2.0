import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modal = await readFile(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');

test('import modal requires explicit review of stale values before sync', () => {
  assert.match(modal, /resolveImportReview/);
  assert.match(modal, /Needs Review/);
  assert.match(modal, /Keep Relora/);
  assert.match(modal, /Use Imported/);
  assert.match(modal, /Potential outdated value/);
  assert.match(modal, /file\.lastModified/);
});
