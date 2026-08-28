# Relora v9 Reliability & Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Relora safe for day-to-day multi-user work with realtime synchronization, field-level conflict protection, leadership-only activity history, archive/restore, and guarded Excel synchronization.

**Architecture:** Supabase remains the source of truth. All mutating shipment operations move behind SECURITY DEFINER RPCs with explicit role checks; the browser subscribes to RLS-filtered shipment changes and reconciles them with the active editor. Pure state/reconciliation helpers remain framework-independent so concurrency, sync-state, archive, and import behavior are regression-testable with Node's built-in test runner.

**Tech Stack:** React 19, Vite 7, Supabase JS 2, Supabase Postgres/RLS/Realtime, AG Grid 34, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-28-relora-v9-reliability-realtime-design.md`

## Global Constraints

- Activity history is visible only to `team_lead`, `manager`, and `admin` for shipments they are authorized to view.
- `assistant_manager`, `employee`, and `portal` do not receive activity-history access in v9.
- Archive/restore is allowed only to `team_lead`, `manager`, and `admin`; permanent delete is `admin` only.
- Normal active shipment queries exclude archived records.
- Same-field concurrent edits must never silently overwrite the server value.
- Blank imported values must not erase populated server values.
- Import persistence remains idempotent and atomic at the database function boundary.
- Existing Google OAuth, role filtering, import date normalization, export, and branding behavior must remain passing.

---

### Task 1: Access rules and database safety migration

**Files:**
- Modify: `src/lib/access.js`
- Modify: `supabase-schema.sql`
- Create: `tests/v9-access-archive-activity.test.js`
- Create: `tests/v9-schema-security.test.js`

**Interfaces:**
- Produces: `canViewActivity(user)`, `canArchiveRows(user)`, `canRestoreRows(user)`, `canPermanentlyDeleteRows(user)`.
- Produces database RPCs: `create_shipment(jsonb)`, `update_shipment_field(uuid,text,jsonb,bigint,jsonb,boolean,jsonb)`, `archive_shipments(uuid[])`, `restore_shipments(uuid[])`, `admin_delete_shipments(uuid[])`, `persist_import_batch(jsonb)`, plus v9 activity schema/RLS and Realtime publication.

- [ ] **Step 1: Write failing access/schema tests**

```js
assert.equal(canViewActivity({ role: 'team_lead' }), true);
assert.equal(canViewActivity({ role: 'assistant_manager' }), false);
assert.equal(canPermanentlyDeleteRows({ role: 'manager' }), false);
assert.equal(canPermanentlyDeleteRows({ role: 'admin' }), true);
assert.match(schema, /version bigint not null default 1/i);
assert.match(schema, /create or replace function public\.update_shipment_field/i);
assert.match(schema, /current_user_role\(\) = 'admin'/i);
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `node --test tests/v9-access-archive-activity.test.js tests/v9-schema-security.test.js`
Expected: FAIL because v9 access helpers/schema objects do not exist.

- [ ] **Step 3: Implement access helpers and SQL migration**

Add role helpers to `access.js`. Extend `shipments` with `version`, `archived_at`, `archived_by`; extend `shipment_activity`; add explicit SECURITY DEFINER write RPCs; revoke direct authenticated shipment writes; add activity RLS and safe Realtime publication registration.

- [ ] **Step 4: Run the new tests and then the full suite**

Run: `node --test tests/v9-access-archive-activity.test.js tests/v9-schema-security.test.js && npm test`
Expected: PASS.

### Task 2: Realtime reconciliation and sync-state model

**Files:**
- Create: `src/lib/realtime.js`
- Create: `src/lib/syncState.js`
- Create: `tests/v9-realtime.test.js`
- Create: `tests/v9-sync-state.test.js`

**Interfaces:**
- Produces: `applyRealtimeEvent(rows, event)`, `reconcileRealtimeEvent(rows,event,activeEdit)`, `subscribeToShipmentChanges(callback,statusCallback)`.
- Produces: `nextSyncState(state,event)` with states `saved`, `saving`, `offline`, `reconnecting`, `sync_issue`.

- [ ] **Step 1: Write failing reducer tests**

```js
assert.deepEqual(applyRealtimeEvent([{ id: '1' }], { eventType: 'DELETE', old: { id: '1' } }), []);
const result = reconcileRealtimeEvent(rows, updateEvent, { rowId: '1', field: 'customer', baseValue: 'A' });
assert.equal(result.rows[0].customer, 'A');
assert.equal(nextSyncState('saved', 'SAVE_START'), 'saving');
assert.equal(nextSyncState('saving', 'SAVE_SUCCESS'), 'saved');
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v9-realtime.test.js tests/v9-sync-state.test.js`
Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement pure reducers and Supabase subscription wrapper**

Realtime UPDATE of an archived row removes it from active rows. For an active edit, merge remote changes except the active field; preserve the editor's field and return the remote event as pending when the remote active field differs from the edit base value.

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `node --test tests/v9-realtime.test.js tests/v9-sync-state.test.js && npm test`
Expected: PASS.

### Task 3: Field-level save conflict API and conflict UI

**Files:**
- Modify: `src/lib/dataApi.js`
- Modify: `src/components/ShipmentGrid.jsx`
- Create: `src/components/ConflictDialog.jsx`
- Create: `tests/v9-field-save.test.js`

**Interfaces:**
- Produces: `ShipmentConflictError`, `updateShipmentField(row, field, currentUser, editContext, options)`, `serializeFieldValue(field,value,row)`.
- Grid calls `onEditingChange(editContext|null)` and `onRowChanged(row,field,editContext)`.

- [ ] **Step 1: Write failing field-save tests**

```js
assert.equal(serializeFieldValue('eta', '1-Jul', { service_month: '202607' }), '2026-07-01');
assert.equal(serializeFieldValue('week_no', '4', {}), 4);
assert.equal(isShipmentConflictResult({ status: 'conflict' }), true);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v9-field-save.test.js`
Expected: FAIL because the v9 API is absent.

- [ ] **Step 3: Implement field serialization/RPC wrapper and edit context capture**

Capture `{rowId,field,baseValue,baseVersion}` in `onCellEditingStarted`. Save via `update_shipment_field`; translate a conflict response into `ShipmentConflictError`. Add a conflict dialog with server/base/user values and `Keep Server Value` / `Use My Value` actions.

- [ ] **Step 4: Verify GREEN and regression suite**

Run: `node --test tests/v9-field-save.test.js && npm test`
Expected: PASS.

### Task 4: Archive/restore and leadership activity UI

**Files:**
- Modify: `src/lib/dataApi.js`
- Modify: `src/components/WorkspaceView.jsx`
- Modify: `src/components/ShipmentGrid.jsx`
- Modify: `src/App.jsx`
- Create: `src/components/ArchivedView.jsx`
- Create: `src/components/ActivityPanel.jsx`
- Create: `tests/v9-ui-safety.test.js`

**Interfaces:**
- Produces data functions: `loadArchivedShipments()`, `archiveShipments(ids)`, `restoreShipments(ids)`, `permanentlyDeleteShipments(ids)`, `loadShipmentActivity(id)`.
- Active Workspace selection action becomes Archive. Archived page exposes Restore for TL/Manager/Admin and Delete Permanently only for Admin.

- [ ] **Step 1: Write failing UI safety tests**

```js
assert.match(workspace, /Archive Selected/);
assert.doesNotMatch(workspace, /Delete Selected/);
assert.match(archived, /Delete Permanently/);
assert.match(activity, /Activity History/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v9-ui-safety.test.js`
Expected: FAIL until v9 UI components/actions exist.

- [ ] **Step 3: Implement archive/activity data APIs and UI**

Add an Archived navigation view for Team Lead/Manager/Admin. Add per-row History action only when `canViewActivity` is true. Load activity on demand; do not preload history for all rows.

- [ ] **Step 4: Verify GREEN and full suite**

Run: `node --test tests/v9-ui-safety.test.js && npm test`
Expected: PASS.

### Task 5: Import conflict review

**Files:**
- Modify: `src/lib/importer.js`
- Modify: `src/components/ImportShipmentModal.jsx`
- Modify: `src/lib/dataApi.js`
- Create: `tests/v9-import-conflicts.test.js`

**Interfaces:**
- `buildImportPlan` accepts optional `importSnapshotAt`.
- Produces `fieldConflicts`, `summary.safeUpdates`, `summary.reviewConflicts`, `summary.unchanged`, `summary.assignmentConflicts`.
- Produces `resolveImportConflicts(plan,resolutions)` where resolution keys select `server` or `import` per conflict field.

- [ ] **Step 1: Write failing import safety tests**

```js
assert.equal(plan.summary.reviewConflicts, 1);
assert.equal(plan.changes[0].row.boc_status, 'RELEASED');
assert.equal(blankPlan.changes[0].changedFields.length, 0);
const resolved = resolveImportConflicts(plan, { [plan.fieldConflicts[0].id]: 'import' });
assert.equal(resolved.changes[0].row.boc_status, 'PAID');
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v9-import-conflicts.test.js`
Expected: FAIL because conflict review does not exist.

- [ ] **Step 3: Implement timestamp/backward-workflow conflict detection and review UI**

Use the uploaded file's `lastModified` as the import snapshot. Differing nonblank fields on a server row newer than that snapshot require review. A backward BOC status also requires review. Keep server value until user explicitly chooses imported value. Disable Sync while any field conflict is unresolved.

- [ ] **Step 4: Persist reviewed batches through `persist_import_batch` and verify GREEN**

Run: `node --test tests/v9-import-conflicts.test.js && npm test`
Expected: PASS.

### Task 6: App integration, sync indicator, docs, and final verification

**Files:**
- Modify: `src/App.jsx`
- Create: `src/components/SyncStatus.jsx`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `package.json`
- Create: `tests/v9-app-integration.test.js`

**Interfaces:**
- App maintains active edit, conflict dialog, sync state, realtime subscription, reconnect reload, archived reload, and activity-opening callbacks.

- [ ] **Step 1: Write failing integration text tests**

```js
assert.match(app, /subscribeToShipmentChanges/);
assert.match(app, /SyncStatus/);
assert.match(app, /ConflictDialog/);
assert.match(app, /ArchivedView/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v9-app-integration.test.js`
Expected: FAIL until integration is wired.

- [ ] **Step 3: Wire v9 state and UI**

Start saves in `saving`, return to `saved` only after success, show `sync_issue` on mutation/subscription errors, show `offline` on browser offline, and on recovery set `reconnecting`, reload authorized rows, then return to `saved` after a healthy subscription. Realtime updates use the active-edit reconciliation helper.

- [ ] **Step 4: Update README/version and run final verification**

Run: `npm test`
Expected: all tests PASS.

Run: `npm run build`
Expected: Vite build exits 0 when dependencies are available; if dependency installation is unavailable in the execution sandbox, report the environment limitation without claiming build success.
