import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as dataApi from '../src/lib/dataApi.js';

const modalSource = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('large imports are split into bounded Supabase batches', () => {
  assert.equal(typeof dataApi.chunkImportPayloads, 'function');
  const chunks = dataApi.chunkImportPayloads(Array.from({ length: 205 }, (_, index) => ({ index })), 100);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [100, 100, 5]);
});

test('batched import persistence reports progress after every committed batch', async () => {
  assert.equal(typeof dataApi.persistImportPayloadBatches, 'function');
  const calls = [];
  const progress = [];
  const rows = Array.from({ length: 205 }, (_, index) => ({ shipment_code: `JF-${index + 1}` }));

  const result = await dataApi.persistImportPayloadBatches(
    rows,
    async (batch) => {
      calls.push(batch.map((row) => row.shipment_code));
      return batch;
    },
    { batchSize: 100, onProgress: (state) => progress.push(state), yieldBetweenBatches: false }
  );

  assert.deepEqual(calls.map((batch) => batch.length), [100, 100, 5]);
  assert.equal(result.length, 205);
  assert.deepEqual(progress.map((state) => [state.batch, state.batches, state.processed, state.total]), [
    [1, 3, 100, 205],
    [2, 3, 200, 205],
    [3, 3, 205, 205]
  ]);
});

test('batch failure tells the user how much was already synced', async () => {
  assert.equal(typeof dataApi.persistImportPayloadBatches, 'function');
  let call = 0;
  await assert.rejects(
    dataApi.persistImportPayloadBatches(
      Array.from({ length: 250 }, (_, index) => ({ shipment_code: `JF-${index + 1}` })),
      async (batch) => {
        call += 1;
        if (call === 2) throw new Error('canceling statement due to statement timeout');
        return batch;
      },
      { batchSize: 100, yieldBetweenBatches: false }
    ),
    /batch 2 of 3.*100 of 250.*statement timeout/i
  );
});

test('import review UI paginates large row traces and shows batch progress', () => {
  assert.match(modalSource, /REVIEW_PAGE_SIZE/);
  assert.match(modalSource, /\.slice\(/);
  assert.match(modalSource, /Previous/);
  assert.match(modalSource, /Next/);
  assert.match(modalSource, /Importing batch/);
  assert.match(modalSource, /processed/);
  assert.match(appSource, /onProgress/);
});

test('v11.3 package version is 1.1.3', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, '1.1.3');
});
