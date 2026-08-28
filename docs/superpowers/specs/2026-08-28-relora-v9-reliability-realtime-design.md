# Relora v9 – Reliability & Realtime Design

## Goal

Make Relora safe for day-to-day multi-user operations by adding real-time synchronization, explicit save/offline state, edit-conflict protection, leadership-only activity history, archive/restore, and import conflict review.

## Approved Access Rules

- Customs Declarant: may view/edit only authorized shipment records; cannot view activity history; cannot permanently delete.
- Team Lead: may view authorized team shipments; may view activity history for authorized shipments; may archive/restore authorized shipments; cannot permanently delete.
- Assistant Manager: management visibility remains unchanged; activity-history access is not added in v9 unless the account also has Manager/Admin privileges.
- Manager: may view activity history, archive, and restore; cannot permanently delete.
- Portal/Broker: existing limited edit rights remain unchanged; no activity-history access.
- Admin: full access including permanent deletion.

Permanent deletion is Admin-only. All normal delete actions become Archive.

## 1. Realtime Synchronization

Relora will subscribe to Supabase Realtime changes on the `shipments` table after authentication. Incoming INSERT/UPDATE/DELETE events are applied to local state only when the event is visible to the current user under existing access rules.

Realtime is supplementary; Supabase remains the source of truth. On reconnect or subscription error, Relora performs a normal authorized reload before showing `Synced` again.

### UI states

The top bar will show one of:

- `Saved` – no local save is pending and the realtime connection is healthy.
- `Saving…` – a user edit/import/archive is being written.
- `Offline` – browser is offline or realtime connection is unavailable.
- `Sync issue` – a save or subscription failed and user attention is required.

## 2. Field-Level Save & Conflict Protection

Relora will stop updating a whole shipment row for a one-cell edit. Normal grid edits will persist only the changed field plus concurrency metadata.

Each shipment will carry:

- `updated_at` – server-side last change timestamp.
- `version` – monotonically increasing integer.

When an edit starts, Relora records the shipment version shown to the user. On save:

- If the server version still matches, save the field and increment version.
- If the server version changed but the changed field is untouched on the server, merge automatically.
- If the same field changed on the server, do not overwrite automatically. Show a conflict dialog.

Conflict dialog shows:

- field name
- value the user started from
- user's proposed value
- current server value
- `Keep Server Value`
- `Use My Value`

Choosing `Use My Value` is a deliberate overwrite and is recorded in the activity log.

## 3. Activity Log

Create `shipment_activity` entries for meaningful mutations:

- field edit
- import update
- import insert
- archive
- restore
- admin permanent delete attempt/result where record retention allows it
- conflict override
- reassignment

Each activity row stores:

- shipment id
- actor user id/email/name snapshot
- action type
- field name when applicable
- old value
- new value
- source (`grid`, `import`, `archive`, `restore`, `conflict`)
- created timestamp

### Visibility

Activity history is visible only to:

- Team Lead for shipments within their authorized team
- Manager for all authorized shipments
- Admin for all shipments

Employees, Portal/Broker users, and Assistant Managers do not receive an Activity tab in v9 unless their role later changes.

The activity panel is loaded on demand from the shipment detail/action drawer; it is not loaded for every row in the master grid.

## 4. Archive & Restore

Add fields to `shipments`:

- `archived_at timestamptz null`
- `archived_by uuid null`

Normal workspace/master queries exclude archived shipments by default.

### Archive permissions

- Team Lead: archive/restore authorized team shipments.
- Manager: archive/restore all authorized shipments.
- Admin: archive/restore and permanently delete.
- Employee/Portal: no archive or delete permission.

### UI

Replace `Delete Selected` with `Archive Selected` for Team Lead/Manager/Admin.

Managers/TLs get an `Archived` view with:

- archive date
- archived by
- restore button

Admin additionally gets `Delete Permanently`, protected by a confirmation that explicitly names the number of shipments being deleted.

## 5. Import Conflict Review

Excel/CSV import remains an upsert-style sync, but existing shipment updates receive a pre-save comparison against current Supabase data.

### Safe merge rules

- Blank imported values never erase a nonblank server value by default.
- Values identical to server data are ignored.
- Fields whose server value changed after the user's import snapshot are flagged for review.
- If imported data would move a workflow field backward (for example `RELEASED` to `PAID`) while the server record is newer, flag it as `Potential outdated value`.
- New shipments remain insertable when their match key is genuinely new.

### Import preview additions

Show counts for:

- New
- Safe updates
- Conflicts requiring review
- Skipped unchanged
- Missing match key

Conflict rows must be reviewed before the import can be confirmed. The user may choose server value or imported value for each conflicting field.

Imports must remain idempotent and batch-based.

## 6. Database & RLS Changes

### `shipments`

Add:

- `version bigint not null default 1`
- `archived_at timestamptz`
- `archived_by uuid references profiles(id)`

Ensure `updated_at` is maintained by a database trigger.

### `shipment_activity`

Extend or recreate activity schema to include:

- `action_type text not null`
- `actor_email text`
- `actor_name text`
- `source text not null`
- `old_value text`
- `new_value text`

### RPCs

Use database functions for operations that require atomic authorization/concurrency checks:

- `update_shipment_field(...)`
- `archive_shipments(...)`
- `restore_shipments(...)`
- `admin_delete_shipments(...)`

Portal/Broker's existing restricted update RPC remains in place.

RLS must enforce every role rule at the database layer; UI hiding alone is not considered authorization.

## 7. Realtime Event Handling

Realtime events are merged into the local `rows` state by shipment id.

If a realtime update arrives for a shipment currently being edited:

- do not replace the active editor value
- store the incoming server version/value as a pending remote change
- resolve automatically when the changes are on different fields
- show conflict UI when they touch the same field

On network recovery:

1. show `Reconnecting…`
2. reload authorized shipments
3. reconcile local pending state
4. subscribe again
5. show `Saved` only after successful reload/subscription

## 8. Error Handling

- Failed single-field save: keep the user's visible value marked unsaved and offer Retry/Revert.
- Failed import: no partial UI success; show the Supabase error and reload current server state.
- Realtime subscription failure: switch to `Sync issue`; normal manual edits may continue only if Supabase requests still succeed.
- Offline: block destructive/archive actions and imports; allow read-only browsing of already loaded data.
- Conflict: never silently choose one user's value over another for the same field.

## 9. Testing Requirements

Add regression tests covering:

- realtime insert/update/delete state reducers
- save indicator state transitions
- different-field concurrent edits auto-merge
- same-field concurrent edits produce a conflict
- Team Lead/Manager activity visibility and Employee/Portal denial
- Manager cannot permanently delete
- Admin can permanently delete
- archive hides row from default views
- restore returns archived row
- old Excel workflow value is flagged instead of overwriting newer server data
- blank imported value does not erase a populated server value
- reconnect reloads before returning to `Saved`

Existing import/date/auth/access/export tests must continue to pass.

## 10. Rollout

Deploy database migration first, then the v9 frontend. Use the current Netlify deployment as a test/UAT pass before the sister's team relies on realtime behavior.

Before production use, test with at least two Google accounts in separate browsers:

1. Employee edits a normal field; Manager sees update without refresh.
2. Employee and Manager edit different fields at the same time; both changes survive.
3. Employee and Manager edit the same field; conflict dialog appears.
4. Manager archives a shipment; it disappears from active views and appears in Archived.
5. Team Lead opens Activity; employee cannot access the same activity history.
6. Upload an older workbook value; Relora flags it instead of silently reversing the current value.

## Known Issues That Still Remain After v9

v9 materially improves safety, but it does not remove every future risk. The next likely issues are:

1. **Rules are still code-driven.** Workflow percentages, SLA thresholds, and next-action logic will eventually need a Manager/Admin settings UI.
2. **User management still depends on approved-user administration.** A Manager-facing Add/Deactivate User page should replace routine SQL work.
3. **Large datasets.** When shipment counts become large, filtering, pagination, and dashboard aggregation should move server-side.
4. **Documents.** Private Supabase Storage, file retention, access logging, and size/type limits are needed before storing BLs/invoices/customs documents.
5. **Notification noise.** If notifications are added, they need digesting and severity rules rather than one alert per change.
6. **Historical team ownership.** A policy is still needed for whether old shipments remain attributed to the original team after staff transfers.
7. **Workflow manual overrides.** Automated values and manual manager overrides need an explicit override model so recalculation does not undo deliberate decisions.
8. **Backup/recovery.** Excel exports are not a database backup; production should rely on Supabase backup/recovery capabilities and a tested restore process.
9. **UAT vs production.** As usage grows, Relora should have separate UAT and production Supabase/Netlify environments so new changes are tested before live deployment.
10. **Permanent internal identity.** A friendly immutable Relora number such as `RLR-2026-000125` should eventually complement the database UUID and Job File Number, especially while a job number is `TBA`.
