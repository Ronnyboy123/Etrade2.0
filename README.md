# Relora v11.3


## v11.3 — Large Import Stability

- Large reviewed imports are sent to Supabase in batches of 100 changes instead of one oversized RPC transaction.
- Import progress shows the committed batch and processed change count while syncing.
- If a later batch fails, Relora stops and reports which batch failed and how many changes were already committed; reopening the preview safely reconciles those rows before retrying.
- Import row trace is paginated at 100 rows per page, while archived matches and stale-value review cards are paginated at 50 per page to avoid rendering thousands of DOM nodes at once.
- The UI yields between database batches so Chrome can repaint progress instead of appearing frozen.
- Existing multi-sheet, wide-sheet, date normalization, archived duplicate, placeholder ID, role, and assignment protections remain in place.
- No new Supabase migration is required for v11.3.


## v11.2 placeholder shipment identity hardening

- Placeholder identifiers such as `TBA`, `TBD`, `N/A`, `NA`, `NONE`, and `-` are never used as shipment codes.
- New-import shipment identity falls through in this order: Job File No. → Entry No. → House AWB/BL → Master AWB/BL → generated `WEB-...` code.
- `B/L NUMBER` and `MASTER BL` headers from the FME workbook map to Relora's House and Master BL fields.
- Multiple rows with `ENTRY NO. = TBA` can therefore import independently when they have different real BL numbers instead of colliding on `ENTRY-TBA`.
- No Supabase migration is required for v11.2.

## v11.1 wide-sheet import hardening

- Bounds SheetJS reads to the actual populated header width instead of trusting oversized/corrupted Excel `!ref` ranges.
- Prevents workbooks with formatting that stretches to columns like `XFD` from hanging on **Reading file...**.
- Keeps v11.0 multi-sheet selection, source-sheet tracing, duplicate/archive review, and date normalization unchanged.
- No Supabase migration is required for v11.1.

## v11.0 multi-sheet import
- Excel workbooks can now import from multiple worksheets in one upload, including workbooks with 10 or more tabs.
- Relora detects every worksheet and shows a sheet-selection step before import review.
- **All Sheets** selects every non-empty worksheet, while individual sheets can be included or excluded.
- Selected worksheets are combined into one import review while preserving the existing duplicate, archived-match, stale-value, ownership, and date-equivalence protections.
- Imported rows keep their **Source Sheet** in the preview so operations users can trace which worksheet supplied each shipment.
- Column order is preserved by first appearance across the selected sheets; equivalent headers with casing differences are normalized to the first-seen header.
- Empty worksheets are shown but cannot be selected.
- No Supabase migration is required for v11.0.

## v10.7 changes
- Import review recognizes archived shipment identities and never treats them as new rows.
- Archived import matches default to **Skip** or can be explicitly **Restore & Update**.
- Customs Declarants can archive/restore only their own assigned shipments after applying `relora-v10.7-migration.sql`.
- Company email addresses such as `name@hartrodt.com.ph` are supported as login usernames because Relora uses email + password authentication.


## v10.6 Archived Admin Bulk Actions

- Admins can select archived shipment rows individually or use the header checkbox to select all archived shipments currently shown by the reporting-month scope.
- The Archived page shows the selected count and provides **Restore Selected** and **Delete Permanently Selected** actions.
- Bulk permanent deletion uses one confirmation for the whole selected set and remains Admin-only.
- Changing the archived result scope clears the current selection.

# Relora v10.5

Relora is an internal shipment and customs operations system built with React, Supabase, AG Grid, and Netlify. **Relora** remains the product/system name and **a. hartrodt** is shown as the organization using it.

## What changed in v10.5

- Customs Declarants (`employee`) can edit **all normal operational shipment fields** on shipments assigned to their own account/workspace, including shipment, customs, portal/broker, biller, imported custom fields, BOC Status, and Delay / Action Remarks.
- Database-managed identity/concurrency/archive fields and Relora-calculated workflow fields remain protected/automatic.
- **Validated Manifest Date** is now a normal Customs field instead of an Automated field. It is always shown in the operational grid and uses the grid's date picker/date-string editor.
- Customs Declarants can **Archive** only shipments assigned to themselves. They cannot archive another declarant's shipment.
- Customs Declarants can view their own archived shipments and **Restore** only their own archived shipments. Permanent deletion remains Admin-only.
- Team Lead archive/restore remains limited to the Team Lead's team. Manager/Admin behavior remains unchanged.
- Apply `relora-v10.5-migration.sql` to an existing Supabase project so server-side Archive/Restore authorization matches the v10.5 UI.
- The v10.4 email + password login remains: there is still no Forgot Password / OTP flow, and accounts continue to use administrator-provided passwords.

## Existing v10 features preserved

- **Email + password login** instead of Google OAuth.
- Year-aware monthly reporting defaults to the current month.
- Official shipment month uses **Service Month** first, with **fallback to ETA** when Service Month is blank/unusable.
- Example: a September 2026 shipment is **not counted in August 2026**.
- Management users can switch between available months and **All Time**.
- Dashboard KPIs, KPI drilldowns, Team Workspaces, My Workspace, Master Shipments, Archived view, search results, bulk actions, and Excel exports use the selected reporting month.
- Manager/Admin can use **Select all results** for the current month/filter result set, then Archive Selected.
- Active shipments are archived rather than permanently deleted. **Admin is the only role allowed to permanently delete** archived records.

## v9 safety features preserved

- Supabase Realtime synchronization.
- `Saving…`, `Saved`, `Offline`, `Reconnecting…`, and `Sync issue` states.
- Same-field edit conflict review and safer different-field merging.
- Activity History for Team Lead, Manager, and Admin.
- Archive/Restore with Admin-only permanent deletion.
- Atomic/idempotent imports and stale Excel conflict review.
- Hardened date normalization for values such as `N/A`, `.`, `TBA`, dashes, and malformed dates.

## 1. Install

```bash
npm install
npm test
npm run build
```

Create `.env` from `.env.example`:

```text
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Never put a service-role key, user password, SMTP password, or other server secret in a Vite variable.

## 2. Database

For an existing v9 database, `relora-v10-migration.sql` only adds safe indexes for Service Month and ETA. It does not delete or rewrite shipment data. If v10.4 is already running, apply `relora-v10.5-migration.sql` before testing employee Archive/Restore. The migration only replaces the Archive/Restore RPC authorization logic; it does not delete or rewrite shipment records.

For a fresh project, run the complete `supabase-schema.sql`.

The application uses:

- `approved_users` as the company allow-list
- `profiles` for application role/team identity
- Supabase RLS as the authorization boundary
- `shipments` as the source of truth
- `shipment_activity` for leadership history

## 3. Create password users safely

Relora does not have public signup or self-service password recovery. Provision accounts deliberately:

1. Add the employee's email and role to `public.approved_users`.
2. In **Supabase → Authentication → Users**, create the Auth user with the **same email** and set an initial/temporary password.
3. Provide that password privately to the employee. Do not place passwords in spreadsheets, shipment records, `approved_users`, or `profiles`.
4. The employee signs in with the provided email/password. Relora calls `claim_approved_profile()` and loads the role/team only when the email is approved and active.
5. If a person leaves, set `approved_users.is_active = false`. Keep their profile/history instead of deleting identity records.

Example allow-list entry:

```sql
insert into public.approved_users
  (email, full_name, role, declarant_name, team_id)
values
  ('andrea@company.com', 'Andrea', 'employee', 'Andrea', 'team2')
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  declarant_name = excluded.declarant_name,
  team_id = excluded.team_id,
  is_active = true;
```

## 4. Supabase Auth configuration

In **Authentication → Providers**, keep Email authentication enabled. Google may remain disabled.

Relora v10.5 does not need recovery-email SMTP settings to sign users in. If custom SMTP was enabled only for password recovery testing, it can be disabled without affecting normal email/password sign-in.

## 5. Login flow

```text
Relora login
↓
Email + password provided by administrator
↓
Supabase Auth verifies credentials
↓
approved_users + profile/RLS authorization check
↓
Authorized workspace
```

There is no Forgot Password or OTP screen in v10.5. If a user needs a new password, an authorized administrator handles the account through Supabase rather than through Relora's UI.

## 6. Monthly reporting rule

The official month is:

```text
Service Month
↓ if blank/unusable
ETA month
```

Examples:

```text
Service Month: August 2026   → 2026-08
Service Month: September     + ETA 2026-09-03 → 2026-09
Service Month: blank         + ETA 2026-09-10 → 2026-09
```

If August 2026 is selected, a shipment whose Service Month is September 2026 is excluded from August totals. September 2026 and September 2027 are separate reporting periods.

## 7. Bulk shipment actions

Manager/Admin get an explicit **Select all results** action. It selects only rows in the current reporting month and current search/grid filter result set. Changing month/search scope clears the selection.

Customs Declarants get row selection in **My Workspace** for their assigned shipments and may archive only those shipments. The same ownership check is enforced again inside the Supabase Archive RPC, so an employee cannot archive another declarant's row by calling the API directly.

Permanent deletion remains available only to Admin from the Archived view and requires confirmation.

## 8. Roles

- `employee`: own workspace/authorized rows; full normal operational editing on own assigned shipments; Archive/Restore only own assigned shipments.
- `team_lead`: own team dashboard/workspaces; Activity History; Archive/Restore authorized team records.
- `assistant_manager`: management dashboard, Master, and team visibility according to existing RLS/access logic.
- `manager`: operational visibility, Activity History, Archive/Restore, explicit Select all results.
- `admin`: full operational access, bulk selection, and Admin-only permanent deletion from Archived.
- `portal`: Master visibility with only the existing Portal/Broker editable fields.

## 9. Deploy to Netlify

Set:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Then deploy from the GitHub-connected project and hard-refresh users (`Ctrl + Shift + R`).

Recommended acceptance checks: email/password login with an admin-provided password, employee edit of Validated Manifest Date/date picker, employee edit across operational groups on an own shipment, employee Archive/Restore of an own shipment, blocked employee Archive of another declarant shipment, current month vs upcoming month totals, historical month switching, All Time management view, Select all results + Archive, realtime two-browser edits, conflict dialog, Activity History, Archive/Restore, and Admin-only permanent delete.

## v10.8 archived-import stale-state fix

- After an Archive action, Relora immediately refreshes the archived shipment cache used by Import Preview.
- If an archived duplicate still reaches the server without an explicit Restore & Update choice, it is safely skipped instead of aborting the entire import batch.
- Restore & Update remains explicit; archived shipments are never silently reactivated.

## v10.9 import date-equivalence fix

- Import Review now compares Excel Date objects and Relora date strings by calendar date instead of raw JavaScript representation.
- The same date (for example, `2025-07-01` vs an Excel Date object for July 1, 2025) is treated as unchanged and no longer creates a false outdated-value warning.
- This also applies to custom Excel date columns such as Delivery Date when XLSX identifies the cell as a date.
- A genuinely different date is still protected by the stale-import review when Relora has newer data.
- No Supabase migration is required for v10.9.
