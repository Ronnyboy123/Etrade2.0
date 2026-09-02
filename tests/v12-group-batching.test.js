import test from 'node:test';
import assert from 'node:assert/strict';
import * as dataApi from '../src/lib/dataApi.js';

function group(code, detailCount, type = 'create') {
  return {
    type,
    row: { shipment_code: code, version: 3 },
    group: {
      groupKey: `job:${code}`,
      details: Array.from({ length: detailCount }, (_, index) => ({
        line_key: `${code}:${index + 1}`,
        source_sheet: 'INCOMING',
        source_row_number: index + 2,
        source_section: 'NEW PRE-ALERTS',
        raw_cells: [{ header: 'SKU', value: `SKU-${index + 1}` }],
        normalized_fields: { material: `SKU-${index + 1}` }
      }))
    }
  };
}

test('chunkImportGroups limits batches to 25 shipment groups', () => {
  assert.equal(typeof dataApi.chunkImportGroups, 'function');
  const groups = Array.from({ length: 26 }, (_, index) => ({ shipment: { shipment_code: `JF-${index + 1}` }, details: [{}] }));
  const chunks = dataApi.chunkImportGroups(groups);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [25, 1]);
});

test('chunkImportGroups also limits batches to 250 detail rows without splitting groups', () => {
  const groups = [
    { shipment: { shipment_code: 'A' }, details: Array.from({ length: 200 }, () => ({})) },
    { shipment: { shipment_code: 'B' }, details: Array.from({ length: 60 }, () => ({})) },
    { shipment: { shipment_code: 'C' }, details: Array.from({ length: 10 }, () => ({})) }
  ];
  const chunks = dataApi.chunkImportGroups(groups);
  assert.deepEqual(chunks.map((chunk) => chunk.map((item) => item.shipment.shipment_code)), [['A'], ['B', 'C']]);
});

test('single shipment group larger than 250 detail rows is sent alone', () => {
  const groups = [
    { shipment: { shipment_code: 'BIG' }, details: Array.from({ length: 400 }, () => ({})) },
    { shipment: { shipment_code: 'SMALL' }, details: [{}] }
  ];
  const chunks = dataApi.chunkImportGroups(groups);
  assert.deepEqual(chunks.map((chunk) => chunk.map((item) => item.shipment.shipment_code)), [['BIG'], ['SMALL']]);
  assert.equal(chunks[0][0].details.length, 400);
});

test('prepareImportGroupPayloads preserves an entire shipment group and skips unchanged/review rows', () => {
  assert.equal(typeof dataApi.prepareImportGroupPayloads, 'function');
  const payloads = dataApi.prepareImportGroupPayloads([
    group('A', 2, 'update'),
    group('B', 3, 'unchanged'),
    group('C', 1, 'needs_review'),
    group('D', 1, 'skip')
  ]);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].shipment.shipment_code, 'A');
  assert.equal(payloads[0].shipment._relora_import_intent, 'update');
  assert.equal(payloads[0].shipment._relora_expected_version, 3);
  assert.equal(payloads[0].details.length, 2);
  assert.equal(payloads[0].details[0].source_section, 'NEW PRE-ALERTS');
});

test('group persistence reports group and detail progress after each committed batch', async () => {
  assert.equal(typeof dataApi.persistImportGroupBatches, 'function');
  const groups = [
    { shipment: { shipment_code: 'A' }, details: Array.from({ length: 200 }, () => ({})) },
    { shipment: { shipment_code: 'B' }, details: Array.from({ length: 60 }, () => ({})) },
    { shipment: { shipment_code: 'C' }, details: Array.from({ length: 10 }, () => ({})) }
  ];
  const progress = [];
  const result = await dataApi.persistImportGroupBatches(groups, async (batch) => batch, {
    onProgress: (state) => progress.push(state),
    yieldBetweenBatches: false
  });
  assert.equal(result.length, 3);
  assert.deepEqual(progress.map((state) => [state.batch, state.batches, state.processedDetails, state.totalDetails]), [
    [1, 2, 200, 270],
    [2, 2, 270, 270]
  ]);
  assert.deepEqual(progress.map((state) => [state.processedGroups, state.totalGroups]), [[1, 3], [3, 3]]);
});

test('later group batch failure reports the already committed shipment groups and detail rows', async () => {
  let call = 0;
  await assert.rejects(
    dataApi.persistImportGroupBatches(
      [
        { shipment: { shipment_code: 'A' }, details: Array.from({ length: 200 }, () => ({})) },
        { shipment: { shipment_code: 'B' }, details: Array.from({ length: 60 }, () => ({})) },
        { shipment: { shipment_code: 'C' }, details: Array.from({ length: 10 }, () => ({})) }
      ],
      async (batch) => {
        call += 1;
        if (call === 2) throw new Error('canceling statement due to statement timeout');
        return batch;
      },
      { yieldBetweenBatches: false }
    ),
    /batch 2 of 2.*1 of 3 shipment groups.*200 of 270 detail rows.*statement timeout/i
  );
});
