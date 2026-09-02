# Relora v12.0 Shipment Detail Exact Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import repeated Excel rows as one shipment master with a complete read-only detail set that exactly syncs to the latest selected workbook data for shipments present in that import.

**Architecture:** Keep `public.shipments` as the operational master table and add `public.shipment_import_lines` as a child table keyed by shipment plus deterministic line identity. The frontend will detect credible workbook headers, group source rows by strongest shipment identity, consolidate one safe master row, preserve every meaningful repeated row as a detail line, review the grouped change, then commit complete shipment groups through a new atomic RPC in group-aware batches.

**Tech Stack:** React 19, Vite 7, SheetJS (`xlsx`), Supabase JS 2.x, PostgreSQL/Supabase RLS and SECURITY DEFINER RPCs, Node `node:test`, AG Grid.

**Spec:** `docs/superpowers/specs/2026-09-01-shipment-detail-exact-sync-design.md`

## Global Constraints

- Keep exactly one `shipments` master record per real shipment.
- Preserve every meaningful Excel detail row under that shipment.
- Exact sync applies only to shipment groups contained in the selected import; shipments absent from the import are untouched.
- Placeholder identifiers `TBA`, `TBD`, `N/A`, `NA`, `NONE`, and `-` are never shipment identities.
- Shipment grouping precedence is Job File No. → Entry No. → House AWB / BL → Master AWB / BL only when no stronger identifier exists.
- Section/template rows such as `NEW PRE-ALERTS` and `AIR SHIPMENTS` must not become shipments.
- Imported details are read-only in v12.0; re-import is the synchronization path.
- Preserve v11.3 import protections: multi-sheet selection, wide-sheet range hardening, stale/version review, archived Restore & Update, date normalization, progress reporting, and bounded database requests.
- A shipment group is atomic and must never be split across requests.
- Batch thresholds are at most 25 shipment groups or 250 detail rows; a single group over 250 detail rows is sent alone.
- `shipment_import_lines` allows authenticated SELECT only through RLS; client-side INSERT/UPDATE/DELETE remain disallowed.
- Existing shipment rows are not rewritten by the migration.
- Package version becomes `1.2.0` and product documentation labels the release `Relora v12.0`.

---

## File Structure

**Create**
- `src/lib/importGrouping.js` — pure header detection, section tracking, shipment grouping, master consolidation, deterministic detail-key generation.
- `src/components/ShipmentDetailsDrawer.jsx` — read-only detail drawer with search and dynamic imported-column table.
- `relora-v12.0-migration.sql` — child table, indexes, updated-at trigger, RLS, grants, and `persist_import_group_batch(jsonb)` RPC.
- `tests/v12-import-grouping.test.js` — pure grouping/header/line-key regressions.
- `tests/v12-import-group-plan.test.js` — grouped import-plan, conflict, archived, and exact-sync preview regressions.
- `tests/v12-group-batching.test.js` — group-aware batching and partial failure regressions.
- `tests/v12-schema-details.test.js` — migration/RLS/RPC safety assertions.
- `tests/v12-details-ui.test.js` — source-level details UI and grid wiring assertions.

**Modify**
- `src/lib/importer.js` — reuse existing header aliases/value semantics while replacing row-level duplicate suppression with group-level planning.
- `src/lib/dataApi.js` — detail loading, grouped payload serialization, group-aware batching, and new RPC caller.
- `src/components/ImportShipmentModal.jsx` — credible-header workbook parsing, shipment-group review, detail preview counts, and grouped sync progress.
- `src/components/ShipmentGrid.jsx` — add Details action without changing one-row-per-shipment behavior.
- `src/App.jsx` — details-drawer state, selected shipment, and grouped import callback wiring.
- `src/styles.css` — grouped import cards and details drawer/table styles.
- `supabase-schema.sql` — canonical schema parity with the v12 migration.
- `README.md` — v12.0 data model/import behavior and migration instructions.
- `package.json` — version `1.2.0`.
- Existing version assertions that intentionally track current release.

---

### Task 1: Detect Credible Headers and Preserve Source Row Context

**Files:**
- Create: `src/lib/importGrouping.js`
- Create: `tests/v12-import-grouping.test.js`
- Modify: `src/lib/importer.js`
- Modify: `src/components/ImportShipmentModal.jsx`

**Interfaces:**
- Consumes: `mapImportedHeaders(headers)` and `IMPORT_SOURCE_SHEET_FIELD` from `src/lib/importer.js`.
- Produces:
  - `detectHeaderRow(matrix, options?) -> { headerIndex: number, headers: string[], score: number }`
  - `parseSheetRows(matrix, sheetName) -> { headers: string[], rows: SourceImportRow[], headerIndex: number }`
  - `SourceImportRow` shape: `{ raw: Record<string, unknown>, sourceSheet: string, sourceRowNumber: number, sourceSection: string }`

- [ ] **Step 1: Write failing header-detection tests**

Add to `tests/v12-import-grouping.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHeaderRow,
  parseSheetRows
} from '../src/lib/importGrouping.js';

test('detectHeaderRow skips title rows and chooses the strongest recognized header row', () => {
  const matrix = [
    ['NEW PRE-ALERTS', 'FOR CHECKING', '', '', ''],
    ['ETA', 'FORWARDER', 'STATUS', 'HOUSE AWB / BL NO.', 'MASTER AWB / BL NO.', 'CONTAINER NO.', 'ENTRY NO.'],
    ['21-Sep', 'EXPEDITORS', 'AWAITS CI', 'HLCULE1260762122', '610256946', 'UACU5194591', 'TBA']
  ];

  const result = detectHeaderRow(matrix);
  assert.equal(result.headerIndex, 1);
  assert.deepEqual(result.headers.slice(0, 5), [
    'ETA', 'FORWARDER', 'STATUS', 'HOUSE AWB / BL NO.', 'MASTER AWB / BL NO.'
  ]);
  assert.ok(result.score > 0);
});

test('parseSheetRows carries source row number and section marker without importing the marker', () => {
  const matrix = [
    ['ETA', 'FORWARDER', 'HOUSE AWB / BL NO.', 'MATERIAL', 'QTY'],
    ['NEW PRE-ALERTS', '', '', '', ''],
    ['21-Sep', 'EXPEDITORS', 'HBL-1', 'SKU-1', '10'],
    ['AIR SHIPMENTS', '', '', '', ''],
    ['3-Aug', 'EXPEDITORS', '079-50970485', 'SKU-2', '2']
  ];

  const parsed = parseSheetRows(matrix, 'INCOMING');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows.map((row) => row.sourceSection), ['NEW PRE-ALERTS', 'AIR SHIPMENTS']);
  assert.deepEqual(parsed.rows.map((row) => row.sourceRowNumber), [3, 5]);
});

test('detectHeaderRow rejects sheets without a credible shipment header set', () => {
  assert.throws(
    () => detectHeaderRow([['Weekly Report'], ['Total', 50], ['Notes', 'Done']]),
    /credible shipment header/i
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/v12-import-grouping.test.js
```

Expected: FAIL because `src/lib/importGrouping.js` and the exported functions do not exist.

- [ ] **Step 3: Implement minimal header scoring and section-aware parsing**

Create `src/lib/importGrouping.js` with a recognized-header set derived from current aliases and a bounded scan of the first 50 nonempty rows. Use a minimum credible score of three recognized shipment headers, including at least one identity header.

Core implementation shape:

```js
const IDENTITY_HEADERS = new Set([
  'JOB FILE NUMBER', 'JOB FILE NO', 'ENTRY NO', 'ENTRY NO.',
  'HOUSE AWB / BL NO.', 'HOUSE AWB / BL', 'B/L NUMBER',
  'MASTER AWB / BL NO.', 'MASTER AWB / BL', 'MASTER BL'
]);

const KNOWN_HEADERS = new Set([
  ...IDENTITY_HEADERS,
  'ETA', 'FORWARDER', 'STATUS', 'CONTAINER NO.', 'CONTAINER NO',
  'MATERIAL', 'SKU', 'DESCRIPTION', 'QTY', 'QUANTITY', 'UOM',
  'INVOICE', 'INVOICE NO.', 'PO', 'PO NO.', 'SHIPPER', 'CUSTOMER', 'MODE'
]);

const normalizeHeader = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

export function detectHeaderRow(matrix = [], { scanLimit = 50 } = {}) {
  let best = null;
  let seenNonEmpty = 0;

  for (let index = 0; index < matrix.length && seenNonEmpty < scanLimit; index += 1) {
    const row = Array.isArray(matrix[index]) ? matrix[index] : [];
    const normalized = row.map(normalizeHeader);
    if (!normalized.some(Boolean)) continue;
    seenNonEmpty += 1;

    const recognized = normalized.filter((value) => KNOWN_HEADERS.has(value));
    const hasIdentity = normalized.some((value) => IDENTITY_HEADERS.has(value));
    const density = normalized.filter(Boolean).length / Math.max(1, normalized.length);
    const score = recognized.length * 10 + Math.round(density * 5) + (hasIdentity ? 20 : 0);

    if (hasIdentity && recognized.length >= 3 && (!best || score > best.score)) {
      best = { headerIndex: index, headers: row.map((value) => String(value ?? '').trim()), score };
    }
  }

  if (!best) throw new Error('No credible shipment header row was found in this sheet.');
  return best;
}
```

Implement `parseSheetRows()` so one-cell/label-only rows become section markers and are not returned as shipment rows. Preserve one-based Excel row numbers.

- [ ] **Step 4: Wire workbook parsing to use `parseSheetRows` instead of assuming row 1**

In `src/components/ImportShipmentModal.jsx`, keep `worksheetImportRange()` but make SheetJS return a matrix and parse each selected sheet through `parseSheetRows(matrix, sheetName)`. Do not invent `Unnamed Column` headers when detection fails; surface the thrown sheet-specific error.

- [ ] **Step 5: Run focused tests and existing wide/multi-sheet tests**

Run:

```bash
node --test tests/v12-import-grouping.test.js tests/v11-1-wide-sheet-import.test.js tests/v11-multisheet-import.test.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/importGrouping.js src/components/ImportShipmentModal.jsx tests/v12-import-grouping.test.js
git commit -m "feat: detect shipment headers and sections"
```

---

### Task 2: Group Repeated Rows and Generate Stable Detail Identities

**Files:**
- Modify: `src/lib/importGrouping.js`
- Modify: `tests/v12-import-grouping.test.js`

**Interfaces:**
- Consumes: `shipmentMatchKeys(row)` and `mapImportedHeaders(headers)` from `src/lib/importer.js`.
- Produces:
  - `groupImportedShipmentRows(sourceRows, headers, assignedTo?) -> ShipmentImportGroup[]`
  - `buildDetailLine(sourceRow, mappedRow, occurrence) -> ShipmentImportDetail`
  - `ShipmentImportGroup` shape: `{ groupKey, shipmentCodeHint, masterRow, details, masterConflicts, sourceSheets }`
  - `ShipmentImportDetail` shape: `{ line_key, source_sheet, source_row_number, source_section, raw_cells, normalized_fields }`

- [ ] **Step 1: Add failing grouping and line-key tests**

Append:

```js
import { groupImportedShipmentRows } from '../src/lib/importGrouping.js';

test('repeated House BL rows become one shipment group with multiple details', () => {
  const rows = [
    { raw: { 'HOUSE AWB / BL NO.': 'COSU6506920530', MATERIAL: 'F00001594', DESCRIPTION: 'FX CorDiax 800', QTY: 24, UOM: 'PCE' }, sourceSheet: 'INCOMING', sourceRowNumber: 10, sourceSection: 'NEW PRE-ALERTS' },
    { raw: { 'HOUSE AWB / BL NO.': 'COSU6506920530', MATERIAL: '5060781', DESCRIPTION: 'BIBAG 5008 650g', QTY: 4480, UOM: 'PCE' }, sourceSheet: 'INCOMING', sourceRowNumber: 11, sourceSection: 'NEW PRE-ALERTS' }
  ];

  const groups = groupImportedShipmentRows(rows, ['HOUSE AWB / BL NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'], 'Ella');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].details.length, 2);
  assert.equal(groups[0].masterRow.house_awb_bl, 'COSU6506920530');
});

test('detail line keys are stable when source row positions move', () => {
  const headers = ['HOUSE AWB / BL NO.', 'CONTAINER NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM'];
  const makeRows = (rowNumber) => [{
    raw: { 'HOUSE AWB / BL NO.': 'HBL-1', 'CONTAINER NO.': 'CONT-1', MATERIAL: 'SKU-1', DESCRIPTION: 'Item', QTY: 10, UOM: 'PCE' },
    sourceSheet: 'INCOMING', sourceRowNumber: rowNumber, sourceSection: 'NEW PRE-ALERTS'
  }];
  const first = groupImportedShipmentRows(makeRows(8), headers)[0].details[0].line_key;
  const moved = groupImportedShipmentRows(makeRows(25), headers)[0].details[0].line_key;
  assert.equal(first, moved);
});

test('identical business detail rows are both preserved using occurrence suffixes', () => {
  const source = {
    raw: { 'HOUSE AWB / BL NO.': 'HBL-2', MATERIAL: 'SKU-2', DESCRIPTION: 'Same', QTY: 5, UOM: 'PCE' },
    sourceSheet: 'INCOMING', sourceSection: 'NEW PRE-ALERTS'
  };
  const groups = groupImportedShipmentRows([
    { ...source, sourceRowNumber: 9 },
    { ...source, sourceRowNumber: 10 }
  ], ['HOUSE AWB / BL NO.', 'MATERIAL', 'DESCRIPTION', 'QTY', 'UOM']);

  assert.equal(groups[0].details.length, 2);
  assert.notEqual(groups[0].details[0].line_key, groups[0].details[1].line_key);
  assert.match(groups[0].details[0].line_key, /:1$/);
  assert.match(groups[0].details[1].line_key, /:2$/);
});

test('placeholder identifiers and template-only rows do not create shipment groups', () => {
  const groups = groupImportedShipmentRows([
    { raw: { 'ENTRY NO.': 'TBA', STATUS: 'WAITING FOR ARRIVAL' }, sourceSheet: 'INCOMING', sourceRowNumber: 20, sourceSection: '' },
    { raw: { 'ENTRY NO.': 'N/A', STATUS: 'WAITING FOR ARRIVAL' }, sourceSheet: 'INCOMING', sourceRowNumber: 21, sourceSection: '' }
  ], ['ENTRY NO.', 'STATUS']);
  assert.equal(groups.length, 0);
});

test('mixed nonblank master values raise a review warning while keeping first source value', () => {
  const groups = groupImportedShipmentRows([
    { raw: { 'HOUSE AWB / BL NO.': 'HBL-3', FORWARDER: 'EXPEDITORS', MATERIAL: 'A' }, sourceSheet: 'INCOMING', sourceRowNumber: 3, sourceSection: '' },
    { raw: { 'HOUSE AWB / BL NO.': 'HBL-3', FORWARDER: 'DHL GLOBAL', MATERIAL: 'B' }, sourceSheet: 'INCOMING', sourceRowNumber: 4, sourceSection: '' }
  ], ['HOUSE AWB / BL NO.', 'FORWARDER', 'MATERIAL']);

  assert.equal(groups[0].masterRow.custom__forwarder, 'EXPEDITORS');
  assert.equal(groups[0].masterConflicts.length, 1);
  assert.deepEqual(groups[0].masterConflicts[0].values, ['EXPEDITORS', 'DHL GLOBAL']);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-import-grouping.test.js
```

Expected: new grouping assertions FAIL because grouping/detail identity is not implemented.

- [ ] **Step 3: Implement deterministic group and detail keys**

Use the strongest key returned by `shipmentMatchKeys(mappedRow)` as `groupKey`. Build detail base identity from normalized sheet/container/invoice/PO/material/description/quantity/UOM; if those are empty, use all nonblank ordered raw cells. Generate a deterministic browser-safe hash with a pure JS function so tests do not depend on Web Crypto:

```js
function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
```

Build `raw_cells` in workbook header order and `normalized_fields` with recognized keys such as `container_number`, `invoice_number`, `po_number`, `material`, `description`, `quantity`, and `uom`.

Apply `:1`, `:2`, ... occurrence suffixes per duplicate base hash within each group in source order.

- [ ] **Step 4: Consolidate master fields without collapsing line-item fields**

Define a line-only field set in `importGrouping.js`:

```js
const DETAIL_ONLY_FIELDS = new Set([
  'custom__container_no', 'custom__container_number',
  'custom__invoice', 'custom__invoice_no',
  'custom__po', 'custom__po_no',
  'custom__material', 'custom__sku',
  'description', 'custom__qty', 'custom__quantity', 'custom__uom'
]);
```

For non-detail master fields, keep the first nonblank value and record `masterConflicts` when later distinct nonblank values disagree. Never let a later SKU row overwrite the first canonical master value.

- [ ] **Step 5: Run grouping tests**

```bash
node --test tests/v12-import-grouping.test.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/importGrouping.js tests/v12-import-grouping.test.js
git commit -m "feat: group shipment rows into import details"
```

---

### Task 3: Replace Row Duplicate Planning with Shipment-Group Planning

**Files:**
- Modify: `src/lib/importer.js`
- Create: `tests/v12-import-group-plan.test.js`
- Modify: existing import tests only where expectations intentionally change from duplicate-row to detail-row behavior.

**Interfaces:**
- Consumes: `ShipmentImportGroup[]` from Task 2 and existing safe-update helpers in `src/lib/importer.js`.
- Produces:
  - `buildGroupedImportPlan({ existingRows, archivedRows, groups, importSnapshotAt }) -> GroupedImportPlan`
  - `GroupedImportChange` shape: `{ type, row, group, changedFields, fieldConflicts, detailDiff, sourceSheets }`
  - `detailDiff` shape: `{ added: number, changed: number, removed: number, existingCount: number, nextCount: number }`

- [ ] **Step 1: Write failing grouped-plan tests**

Create `tests/v12-import-group-plan.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroupedImportPlan } from '../src/lib/importer.js';

const group = (overrides = {}) => ({
  groupKey: 'house:HBL-1',
  shipmentCodeHint: 'HBL-1',
  masterRow: { id: 'IMPORT-1', assigned_to: 'Ella', house_awb_bl: 'HBL-1', customer: 'Customer A' },
  details: [
    { line_key: 'line-a:1', source_sheet: 'INCOMING', raw_cells: [{ header: 'MATERIAL', value: 'A' }], normalized_fields: { material: 'A' } },
    { line_key: 'line-b:1', source_sheet: 'INCOMING', raw_cells: [{ header: 'MATERIAL', value: 'B' }], normalized_fields: { material: 'B' } }
  ],
  masterConflicts: [],
  sourceSheets: ['INCOMING'],
  ...overrides
});

test('one grouped shipment produces one master change with all details', () => {
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [], groups: [group()] });
  assert.equal(plan.summary.created, 1);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].group.details.length, 2);
  assert.equal(plan.summary.detailRows, 2);
});

test('mixed master values require review before commit', () => {
  const plan = buildGroupedImportPlan({
    existingRows: [], archivedRows: [],
    groups: [group({ masterConflicts: [{ field: 'customer', label: 'Customer', values: ['A', 'B'] }] })]
  });
  assert.equal(plan.masterConflicts.length, 1);
  assert.equal(plan.changes[0].type, 'needs_review');
});

test('archived group stays archived unless Restore & Update is selected', () => {
  const archived = { id: 'SHP-1', shipment_code: 'BL-HBL-1', house_awb_bl: 'HBL-1', assigned_to: 'Ella', archived_at: '2026-08-01T00:00:00Z', version: 2 };
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [archived], groups: [group()] });
  assert.equal(plan.archivedConflicts.length, 1);
  assert.equal(plan.changes[0].type, 'archived_match');
});

test('same shipment group is never counted as duplicate selected-sheet shipments', () => {
  const plan = buildGroupedImportPlan({ existingRows: [], archivedRows: [], groups: [group()] });
  assert.equal(plan.summary.duplicates, 0);
  assert.ok(plan.rowTrace.every((trace) => trace.result !== 'Duplicate in selected sheets'));
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-import-group-plan.test.js
```

Expected: FAIL because `buildGroupedImportPlan` does not exist.

- [ ] **Step 3: Extract existing safe master merge logic into a group-compatible helper**

Inside `src/lib/importer.js`, keep the existing date equivalence, workflow regression, assignment conflict, stale snapshot, archived resolution, and version semantics. Introduce:

```js
function planMasterChange({ oldRow, incoming, importSnapshotTime, sourceSheets }) {
  // return { merged, changedFields, fieldConflicts, type }
}
```

Do not remove `buildImportPlan()` yet; keep it as compatibility coverage until the v12 modal is switched. `buildGroupedImportPlan()` should be the v12 entry point.

- [ ] **Step 4: Add detail-diff input support without fetching inside the planner**

Accept optional `existingDetailsByShipmentId = new Map()` in `buildGroupedImportPlan()`. Compare by `line_key` and canonical JSON of `raw_cells`/`normalized_fields`:

```js
function detailDiff(existing = [], next = []) {
  const oldByKey = new Map(existing.map((line) => [line.line_key, line]));
  const nextByKey = new Map(next.map((line) => [line.line_key, line]));
  const added = next.filter((line) => !oldByKey.has(line.line_key)).length;
  const removed = existing.filter((line) => !nextByKey.has(line.line_key)).length;
  const changed = next.filter((line) => {
    const old = oldByKey.get(line.line_key);
    return old && JSON.stringify([old.raw_cells, old.normalized_fields]) !== JSON.stringify([line.raw_cells, line.normalized_fields]);
  }).length;
  return { added, changed, removed, existingCount: existing.length, nextCount: next.length };
}
```

- [ ] **Step 5: Run grouped-plan plus legacy import tests**

```bash
node --test tests/v12-import-group-plan.test.js tests/import.test.js tests/v10-9-import-date-equivalence.test.js tests/v10-7-archived-import-recovery.test.js
```

Expected: all PASS, with legacy behavior unchanged until the UI switches to the grouped planner.

- [ ] **Step 6: Commit**

```bash
git add src/lib/importer.js tests/v12-import-group-plan.test.js tests/import.test.js
git commit -m "feat: plan imports by shipment group"
```

---

### Task 4: Add Shipment Detail Table, RLS, and Atomic Group RPC

**Files:**
- Create: `relora-v12.0-migration.sql`
- Modify: `supabase-schema.sql`
- Create: `tests/v12-schema-details.test.js`

**Interfaces:**
- Consumes: existing `public.current_user_role()`, `public.current_user_team_id()`, `public.current_user_declarant_name()`, `public.v9_can_mutate_shipment(uuid)`, `public.v9_apply_shipment_patch(uuid,jsonb)`.
- Produces:
  - table `public.shipment_import_lines`
  - RPC `public.persist_import_group_batch(p_groups jsonb) returns jsonb`
  - RLS SELECT policy tied to parent `shipments` visibility.

- [ ] **Step 1: Write failing schema tests**

Create `tests/v12-schema-details.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('v12 migration creates shipment_import_lines with deterministic uniqueness and cascade', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /create table if not exists public\.shipment_import_lines/i);
  assert.match(sql, /shipment_id uuid not null references public\.shipments\(id\) on delete cascade/i);
  assert.match(sql, /raw_cells jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql, /normalized_fields jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /unique\s*\(shipment_id,\s*line_key\)/i);
});

test('detail table is SELECT-only for authenticated clients and protected by parent visibility RLS', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /alter table public\.shipment_import_lines enable row level security/i);
  assert.match(sql, /create policy "shipment import lines read access"/i);
  assert.match(sql, /exists\s*\(\s*select 1\s*from public\.shipments/i);
  assert.match(sql, /grant select on public\.shipment_import_lines to authenticated/i);
  assert.match(sql, /revoke insert, update, delete on public\.shipment_import_lines from authenticated/i);
});

test('group RPC exact-syncs detail rows inside the shipment transaction', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.match(sql, /create or replace function public\.persist_import_group_batch\(p_groups jsonb\)/i);
  assert.match(sql, /insert into public\.shipment_import_lines/i);
  assert.match(sql, /on conflict \(shipment_id, line_key\) do update/i);
  assert.match(sql, /delete from public\.shipment_import_lines/i);
  assert.match(sql, /line_key <> all|not \(line_key = any|not in/i);
  assert.match(sql, /shipment_detail_count/i);
});

test('migration does not rewrite or delete existing shipment masters', () => {
  const sql = read('../relora-v12.0-migration.sql');
  assert.doesNotMatch(sql, /delete\s+from\s+public\.shipments/i);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /update\s+public\.shipments\s+set\s+shipment_code/i);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-schema-details.test.js
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the detail table and RLS in `relora-v12.0-migration.sql`**

Use:

```sql
create table if not exists public.shipment_import_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  line_key text not null,
  source_sheet text,
  source_row_number integer,
  source_section text,
  raw_cells jsonb not null default '[]'::jsonb,
  normalized_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, line_key)
);

create index if not exists shipment_import_lines_shipment_idx
  on public.shipment_import_lines (shipment_id);

alter table public.shipment_import_lines enable row level security;

create policy "shipment import lines read access"
on public.shipment_import_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.shipments s
    where s.id = shipment_import_lines.shipment_id
      and (
        public.current_user_role() in ('manager','assistant_manager','admin')
        or (public.current_user_role() = 'team_lead' and s.team_id = public.current_user_team_id())
        or (
          public.current_user_role() = 'employee'
          and (
            s.assigned_user_id = auth.uid()
            or lower(coalesce(s.assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
          )
        )
        or public.current_user_role() = 'portal'
      )
  )
);

revoke insert, update, delete on public.shipment_import_lines from authenticated;
grant select on public.shipment_import_lines to authenticated;
```

For portal visibility, mirror the exact parent visibility predicate from the current `shipment read access` policy in `supabase-schema.sql`; do not broaden it beyond what the parent shipment policy already permits.

- [ ] **Step 4: Add a shared `updated_at` trigger for detail rows**

If the schema already exposes an updated-at trigger function, reuse it. Otherwise add a v12-specific function:

```sql
create or replace function public.set_shipment_import_line_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shipment_import_lines_updated_at on public.shipment_import_lines;
create trigger shipment_import_lines_updated_at
before update on public.shipment_import_lines
for each row execute function public.set_shipment_import_line_updated_at();
```

- [ ] **Step 5: Implement `persist_import_group_batch` with one transaction per request and one atomic unit per group**

The function accepts:

```json
[
  {
    "shipment": {
      "shipment_code": "BL-HBL-1",
      "_relora_import_intent": "update",
      "_relora_expected_version": 4
    },
    "details": [
      {
        "line_key": "abc:1",
        "source_sheet": "INCOMING",
        "source_row_number": 12,
        "source_section": "NEW PRE-ALERTS",
        "raw_cells": [],
        "normalized_fields": {}
      }
    ]
  }
]
```

Inside the loop, reuse the same create/update/restore authorization and optimistic version checks as `persist_import_batch`. After the master is successfully locked/mutated, exact-sync details:

```sql
select count(*) into v_old_detail_count
from public.shipment_import_lines
where shipment_id = v_id;

v_detail_keys := array[]::text[];
for detail_item in select value from jsonb_array_elements(coalesce(item -> 'details', '[]'::jsonb)) loop
  v_line_key := nullif(trim(detail_item ->> 'line_key'), '');
  if v_line_key is null then raise exception 'Import detail is missing line_key for shipment %', v_code; end if;
  v_detail_keys := array_append(v_detail_keys, v_line_key);

  insert into public.shipment_import_lines (
    shipment_id, line_key, source_sheet, source_row_number, source_section, raw_cells, normalized_fields
  ) values (
    v_id,
    v_line_key,
    detail_item ->> 'source_sheet',
    nullif(detail_item ->> 'source_row_number','')::integer,
    detail_item ->> 'source_section',
    coalesce(detail_item -> 'raw_cells','[]'::jsonb),
    coalesce(detail_item -> 'normalized_fields','{}'::jsonb)
  )
  on conflict (shipment_id, line_key) do update set
    source_sheet = excluded.source_sheet,
    source_row_number = excluded.source_row_number,
    source_section = excluded.source_section,
    raw_cells = excluded.raw_cells,
    normalized_fields = excluded.normalized_fields,
    updated_at = now();
end loop;

delete from public.shipment_import_lines
where shipment_id = v_id
  and not (line_key = any(coalesce(v_detail_keys, array[]::text[])));
```

For an imported group with zero meaningful details, exact sync intentionally clears existing imported details for that shipment because the group is present and its complete imported detail set is empty.

Write one activity record per group with a structured `new_value`, for example:

```sql
jsonb_build_object(
  'shipment_code', v_after.shipment_code,
  'shipment_detail_count', v_new_detail_count,
  'previous_detail_count', v_old_detail_count
)::text
```

Return an array of objects containing the flattened shipment row and detail counts:

```json
{
  "shipment": {"id":"...","shipment_code":"..."},
  "detail_count": 12,
  "previous_detail_count": 10
}
```

- [ ] **Step 6: Mirror the migration additions into `supabase-schema.sql`**

Keep the canonical schema and fresh-project bootstrap behavior aligned with the migration.

- [ ] **Step 7: Run schema tests plus existing security tests**

```bash
node --test tests/v12-schema-details.test.js tests/v9-schema-security.test.js tests/v9-rpc-hardening.test.js tests/supabase-security-v8.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add relora-v12.0-migration.sql supabase-schema.sql tests/v12-schema-details.test.js
git commit -m "feat: add atomic shipment detail sync schema"
```

---

### Task 5: Serialize Group Payloads and Batch Without Splitting Shipment Groups

**Files:**
- Modify: `src/lib/dataApi.js`
- Create: `tests/v12-group-batching.test.js`

**Interfaces:**
- Consumes: `GroupedImportChange[]` from Task 3.
- Produces:
  - `prepareImportGroupPayloads(changes) -> ImportGroupPayload[]`
  - `chunkImportGroups(groups, { maxGroups = 25, maxDetails = 250 }?) -> ImportGroupPayload[][]`
  - `persistImportGroupBatches(groups, sendBatch, options?) -> Promise<object[]>`
  - `persistImportGroups(changes, currentUser, options?) -> Promise<object[]>`
  - `loadShipmentImportLines(shipmentId) -> Promise<ShipmentImportLine[]>`

- [ ] **Step 1: Write failing group-batching tests**

Create `tests/v12-group-batching.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkImportGroups,
  persistImportGroupBatches,
  prepareImportGroupPayloads
} from '../src/lib/dataApi.js';

const payload = (code, details) => ({
  shipment: { shipment_code: code, _relora_import_intent: 'create' },
  details: Array.from({ length: details }, (_, i) => ({ line_key: `${code}-${i}:1` }))
});

test('group batching stops at 25 groups even when detail count is low', () => {
  const chunks = chunkImportGroups(Array.from({ length: 26 }, (_, i) => payload(`JF-${i}`, 1)));
  assert.deepEqual(chunks.map((chunk) => chunk.length), [25, 1]);
});

test('group batching stops before exceeding 250 detail rows', () => {
  const chunks = chunkImportGroups([payload('A', 200), payload('B', 60), payload('C', 10)]);
  assert.deepEqual(chunks.map((chunk) => chunk.map((group) => group.shipment.shipment_code)), [['A'], ['B', 'C']]);
});

test('a single shipment over 250 details is sent alone and never split', () => {
  const chunks = chunkImportGroups([payload('BIG', 400), payload('SMALL', 1)]);
  assert.equal(chunks[0].length, 1);
  assert.equal(chunks[0][0].details.length, 400);
  assert.equal(chunks[1].length, 1);
});

test('group batch progress reports committed groups and details', async () => {
  const progress = [];
  await persistImportGroupBatches(
    [payload('A', 200), payload('B', 60), payload('C', 10)],
    async (batch) => batch.map((group) => ({ shipment: group.shipment })),
    { onProgress: (state) => progress.push(state), yieldBetweenBatches: false }
  );
  assert.deepEqual(progress.map((x) => [x.processedGroups, x.totalGroups, x.processedDetails, x.totalDetails]), [
    [1, 3, 200, 270],
    [3, 3, 270, 270]
  ]);
});

test('failed later group batch reports previously committed scope', async () => {
  let calls = 0;
  await assert.rejects(
    persistImportGroupBatches(
      [payload('A', 200), payload('B', 60), payload('C', 10)],
      async () => {
        calls += 1;
        if (calls === 2) throw new Error('canceling statement due to statement timeout');
        return [];
      },
      { yieldBetweenBatches: false }
    ),
    /batch 2 of 2.*1 of 3 shipment groups.*200 of 270 detail rows.*statement timeout/i
  );
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-group-batching.test.js
```

Expected: FAIL because group batching exports do not exist.

- [ ] **Step 3: Implement grouped payload serialization**

In `src/lib/dataApi.js`:

```js
export function prepareImportGroupPayloads(changes) {
  return (changes || [])
    .filter((change) => change?.group && !['conflict', 'skip', 'archived_match', 'needs_review'].includes(change.type))
    .map((change) => {
      const shipment = serializeShipmentRow(change.row);
      shipment._relora_import_intent = change.type;
      if (['update', 'restore_update'].includes(change.type) && Number.isFinite(Number(change.row?.version))) {
        shipment._relora_expected_version = Number(change.row.version);
      }
      return {
        shipment,
        details: (change.group.details || []).map((detail) => ({
          line_key: detail.line_key,
          source_sheet: detail.source_sheet || null,
          source_row_number: Number(detail.source_row_number) || null,
          source_section: detail.source_section || null,
          raw_cells: detail.raw_cells || [],
          normalized_fields: detail.normalized_fields || {}
        }))
      };
    });
}
```

- [ ] **Step 4: Implement threshold-aware `chunkImportGroups`**

Never split a group. Start a new chunk before adding a group if adding it would exceed either threshold and the current chunk is nonempty.

- [ ] **Step 5: Implement grouped persistence and error/progress accounting**

Call:

```js
const { data, error } = await client.rpc('persist_import_group_batch', { p_groups: batch });
```

Progress state must include:

```js
{
  batch,
  batches,
  processedGroups,
  totalGroups,
  processedDetails,
  totalDetails
}
```

Retain the v11.3 zero-timeout yield between successful batches.

- [ ] **Step 6: Add detail loader**

```js
export async function loadShipmentImportLines(shipmentId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('shipment_import_lines')
    .select('id,shipment_id,line_key,source_sheet,source_row_number,source_section,raw_cells,normalized_fields,created_at,updated_at')
    .eq('shipment_id', shipmentId)
    .order('source_sheet', { ascending: true })
    .order('source_row_number', { ascending: true });
  if (error) throw error;
  return data || [];
}
```

- [ ] **Step 7: Run grouped batching and existing v11.3 batching tests**

```bash
node --test tests/v12-group-batching.test.js tests/v11-3-large-import-stability.test.js tests/data-api-v8.test.js
```

Expected: all PASS. Keep old `persistImportChanges()` for backward compatibility, but v12 UI will use `persistImportGroups()`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dataApi.js tests/v12-group-batching.test.js
git commit -m "feat: batch complete shipment groups"
```

---

### Task 6: Switch Import Review to Shipment Groups and Exact-Sync Preview

**Files:**
- Modify: `src/components/ImportShipmentModal.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `src/lib/importer.js`
- Create/Modify: `tests/v12-import-group-plan.test.js`
- Modify: `tests/v9-import-review-ui.test.js`

**Interfaces:**
- Consumes: `parseSheetRows()`, `groupImportedShipmentRows()`, `buildGroupedImportPlan()`, `persistImportGroups()`.
- Produces: grouped preview UI and `onImported({ rows, importResult })` callback behavior compatible with existing app refresh.

- [ ] **Step 1: Add failing source/UI assertions for shipment-group review**

Append to `tests/v12-import-group-plan.test.js`:

```js
import fs from 'node:fs';
const modalSource = fs.readFileSync(new URL('../src/components/ImportShipmentModal.jsx', import.meta.url), 'utf8');

test('import modal reviews shipment groups instead of selected-sheet duplicate rows', () => {
  assert.match(modalSource, /Shipment groups|shipment group/i);
  assert.match(modalSource, /Detail rows/i);
  assert.match(modalSource, /will be added/i);
  assert.match(modalSource, /will change/i);
  assert.match(modalSource, /will be removed/i);
  assert.doesNotMatch(modalSource, /Duplicate in selected sheets/);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-import-group-plan.test.js
```

Expected: FAIL because modal remains row-centric.

- [ ] **Step 3: Build grouped preview after sheet selection**

After `parseSheetRows`, combine selected source rows while preserving sheet/row/section context. Group them once:

```js
const groups = groupImportedShipmentRows(sourceRows, detectedHeaders, assignedTo);
const plan = buildGroupedImportPlan({
  existingRows: [...rows, ...archivedRows],
  archivedRows,
  groups,
  importSnapshotAt,
  existingDetailsByShipmentId
});
```

Load existing details only for matched existing/archived shipment IDs in the preview, not for every shipment in the database. Add `loadShipmentImportLines` requests with `Promise.all` after grouping and before final plan construction.

- [ ] **Step 4: Replace row summary with group summary**

Show:

```text
Shipment groups: 42
Detail rows: 318
New: 7
Update: 31
Unchanged: 3
Archived Match: 1
Needs Review: 2
```

For each group card show shipment identifier, source sheet(s), detail row count, action, master conflicts, and exact-sync diff:

```text
8 shipment details will be added
2 will change
1 existing detail will be removed
```

Keep row trace paginated; repeated meaningful rows show `Detail row`, section rows show `Section marker`, and skipped templates show `Skipped - no shipment identity/detail payload`.

- [ ] **Step 5: Make unresolved master conflicts block commit**

Reuse the current explicit conflict-resolution UX. Each `masterConflict` must have a deterministic id such as `${groupKey}:master:${field}` and require `Keep Relora/First imported` or a clearly named imported-value choice before sync. Do not silently choose a conflicting later value.

- [ ] **Step 6: Switch commit from `persistImportChanges` to `persistImportGroups`**

Use grouped progress copy:

```text
Importing batch 2 of 5
18 of 42 shipment groups processed
164 of 318 detail rows processed
```

On a partial failure, keep the error from `persistImportGroupBatches` and refresh active/archived shipments so a re-opened preview compares against committed batches.

- [ ] **Step 7: Run focused import UI tests**

```bash
node --test tests/v12-import-group-plan.test.js tests/v9-import-review-ui.test.js tests/v11-3-large-import-stability.test.js tests/v11-multisheet-import.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ImportShipmentModal.jsx src/App.jsx src/styles.css src/lib/importer.js tests/v12-import-group-plan.test.js tests/v9-import-review-ui.test.js
git commit -m "feat: review and sync shipment groups"
```

---

### Task 7: Add Read-Only Shipment Details Drawer

**Files:**
- Create: `src/components/ShipmentDetailsDrawer.jsx`
- Modify: `src/components/ShipmentGrid.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Create: `tests/v12-details-ui.test.js`

**Interfaces:**
- Consumes: `loadShipmentImportLines(shipmentId)` from Task 5.
- Produces:
  - `ShipmentDetailsDrawer({ shipment, open, onClose })`
  - ShipmentGrid prop `onOpenDetails(row)`.

- [ ] **Step 1: Write failing UI wiring tests**

Create `tests/v12-details-ui.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('shipment grid exposes a Details action without changing row data', () => {
  const source = read('../src/components/ShipmentGrid.jsx');
  assert.match(source, /onOpenDetails/);
  assert.match(source, />Details</);
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
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-details-ui.test.js
```

Expected: FAIL because drawer and wiring do not exist.

- [ ] **Step 3: Implement `ShipmentDetailsDrawer`**

Behavior:
- Load details when `open && shipment?.id` changes.
- Show loading/error/zero-detail states.
- Build ordered dynamic columns from `raw_cells` by first-seen header order across lines.
- Hide columns that are empty for every line unless `showAllColumns` is enabled.
- Filter rows by a case-insensitive search across source sheet, section, and all cell values.
- Keep details read-only; render text only, no inputs.

Core column derivation:

```js
function detailColumns(lines, showAllColumns) {
  const order = [];
  const seen = new Set();
  for (const line of lines) {
    for (const cell of line.raw_cells || []) {
      if (!seen.has(cell.header)) {
        seen.add(cell.header);
        order.push(cell.header);
      }
    }
  }
  return showAllColumns
    ? order
    : order.filter((header) => lines.some((line) =>
        (line.raw_cells || []).some((cell) => cell.header === header && String(cell.value ?? '').trim())
      ));
}
```

- [ ] **Step 4: Add Details action to `ShipmentGrid`**

Keep the existing History button and add Details beside it. Do not add detail rows to AG Grid `rowData`.

```jsx
<button className="grid-history-button" onClick={() => onOpenDetails(params.data)}>Details</button>
<button className="grid-history-button" onClick={() => onOpenActivity(params.data)}>History</button>
```

- [ ] **Step 5: Wire drawer state in `App.jsx`**

Add one selected shipment state, pass `onOpenDetails` to grid/workspace children, and render one drawer at app level.

- [ ] **Step 6: Add focused styles**

Add `.shipment-details-backdrop`, `.shipment-details-drawer`, `.shipment-details-table-wrap`, `.shipment-details-toolbar`, and mobile width rules. Reuse existing typography/button variables; do not redesign the app theme.

- [ ] **Step 7: Run UI tests and grid regressions**

```bash
node --test tests/v12-details-ui.test.js tests/ag-grid-config-v71.test.js tests/v9-app-integration.test.js tests/v9-ui-safety.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ShipmentDetailsDrawer.jsx src/components/ShipmentGrid.jsx src/App.jsx src/styles.css tests/v12-details-ui.test.js
git commit -m "feat: show imported shipment details"
```

---

### Task 8: Verify Exact-Sync Database Behavior on a Safe Supabase Branch or Transactional Test Harness

**Files:**
- Modify: `tests/v12-schema-details.test.js` only if additional static assertions are needed.
- No production file changes unless a verified defect is found.

**Interfaces:**
- Consumes: `relora-v12.0-migration.sql` and `persist_import_group_batch` from Task 4.
- Produces: verification evidence for add/update/remove, absent-shipment safety, archived safety, and rollback atomicity.

- [ ] **Step 1: Create an isolated Supabase development branch before applying v12 migration**

Use the Supabase branch tool at execution time. Do not apply the migration to production first. The branch must inherit current schema but not production data.

- [ ] **Step 2: Apply `relora-v12.0-migration.sql` to the development branch**

Expected: migration succeeds without rewriting `public.shipments`.

- [ ] **Step 3: Seed two test shipments plus a test authorized user context through the branch-compatible test path**

Use shipment codes `TEST-V12-A` and `TEST-V12-B`. Insert initial detail rows for A and B through the grouped RPC, not direct authenticated DML, so the same authorization path is exercised.

- [ ] **Step 4: Verify add/update/remove exact sync for shipment A**

First import A with lines `A:1`, `B:1`; second import A with changed `A:1` and new `C:1`. Verify:

```text
A has exactly A:1 and C:1
A:1 contains the new raw/normalized values
B:1 was removed
```

- [ ] **Step 5: Verify shipment B remains untouched when absent from the second import**

Query `shipment_import_lines` for B and confirm its original detail rows remain.

- [ ] **Step 6: Verify archived safety**

Archive A, call group RPC with normal `create/update` intent, and confirm A stays archived and details are not silently changed. Then call with explicit `restore_update` and the correct expected version; confirm A restores and details exact-sync.

- [ ] **Step 7: Verify parent + details rollback together**

Send one group with a valid master change but an invalid detail lacking `line_key`. Confirm the RPC errors and both the master version/value and its prior detail set remain unchanged.

- [ ] **Step 8: Record the branch verification results in the implementation session notes and delete/close the branch if project policy requires it**

No production migration occurs in this task.

- [ ] **Step 9: Commit only if verification revealed and fixed a defect**

If no code changes were needed, do not create an empty commit.

---

### Task 9: Release Metadata, Documentation, and Full Regression Verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: current-version tests (`tests/v10-schema-docs.test.js`, `tests/v10-4-no-password-recovery.test.js`, `tests/v11-multisheet-import.test.js`, `tests/v11-1-wide-sheet-import.test.js`, `tests/v11-2-placeholder-shipment-code.test.js`, `tests/v11-3-large-import-stability.test.js`) only where they explicitly assert the current package/release version.
- Add no secrets or real `.env` values.

**Interfaces:**
- Consumes: all completed v12 behavior.
- Produces: package version `1.2.0`, v12.0 README instructions, migration/deployment checklist.

- [ ] **Step 1: Add a failing release-version assertion**

In `tests/v12-schema-details.test.js` append:

```js
test('Relora v12.0 package version is 1.2.0', () => {
  const pkg = JSON.parse(read('../package.json'));
  assert.equal(pkg.version, '1.2.0');
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test tests/v12-schema-details.test.js
```

Expected: FAIL because package version is still `1.1.3`.

- [ ] **Step 3: Update package and README**

Set:

```json
"version": "1.2.0"
```

README v12.0 section must document:
- one master shipment plus imported detail lines;
- exact sync limited to shipment groups present in selected import;
- section/header detection;
- grouped batch limits `25 shipment groups / 250 detail rows`;
- Details drawer is read-only;
- required `relora-v12.0-migration.sql` deployment before the v12 frontend;
- v11.3 frontend remains backward-readable because existing shipment masters are unchanged;
- `.env.example` remains placeholders only.

- [ ] **Step 4: Update stale current-version assertions**

Change only assertions whose purpose is tracking the current package version. Do not weaken behavioral tests.

- [ ] **Step 5: Run the complete test suite**

```bash
npm test
```

Expected: zero failures. Record the exact pass count from this fresh run; do not reuse an earlier count.

- [ ] **Step 6: Run production build**

```bash
npm run build
```

Expected: exit 0 and a new `dist/`. If dependencies are unavailable in the execution environment, report the exact failure instead of claiming build success.

- [ ] **Step 7: Verify no credentials are packaged**

Run:

```bash
git status --short
git ls-files | grep -E '(^|/)\.env($|\.)' || true
```

Expected tracked env file list contains only `.env.example`. Also inspect `.gitignore` still ignores real env variants.

- [ ] **Step 8: Package and verify the artifact**

Create `relora-v12.0.zip` excluding `.git`, `node_modules`, `dist`, and real `.env*` files while including `.env.example`. Then:

```bash
unzip -t relora-v12.0.zip
```

Extract to a fresh verification folder and run:

```bash
npm test
```

from the extracted source. Record the exact pass count.

- [ ] **Step 9: Commit release metadata**

```bash
git add package.json README.md tests
git commit -m "release: prepare Relora v12.0"
```

---

## Deployment Order After Implementation Verification

1. Back up/confirm the production Supabase project state.
2. Apply `relora-v12.0-migration.sql` to production Supabase.
3. Verify `shipment_import_lines` table, RLS, and `persist_import_group_batch` exist.
4. Deploy the verified v12.0 frontend build to Netlify.
5. Hard refresh or use an incognito window.
6. Import a small known workbook selection first and verify one shipment master plus all expected detail rows.
7. Re-import the same shipment with one added, one changed, and one removed detail line and verify exact sync.
8. Only then use the large production workbook.

## Self-Review Results

- **Spec coverage:** Tasks cover header detection, section markers, grouping, master consolidation, deterministic duplicate-preserving line keys, exact-sync SQL, group-aware batching, grouped review UX, read-only details UI, RLS, archived behavior, atomic rollback, absent-shipment safety, version/docs, and full regression verification.
- **Placeholder scan:** No `TBD`, `TODO`, “implement later”, or unspecified test steps remain.
- **Type/interface consistency:** `ShipmentImportGroup`, `ShipmentImportDetail`, `GroupedImportChange`, group payloads, detail loader, and progress-state names are defined before downstream tasks consume them.
