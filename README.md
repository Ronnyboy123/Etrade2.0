# Relora v10.4

Relora is an internal shipment and customs operations system built with React, Supabase, AG Grid, and Netlify. **Relora** remains the product/system name and **a. hartrodt** is shown as the organization using it.

## What changed in v10.4

- Keeps **email + password** sign-in through Supabase Auth.
- Removes the **Forgot password** screen, recovery-code/OTP flow, `/reset-password` flow, and signed-in **Password** email action.
- Removes the recovery-only helper and email-template artifact. Custom SMTP/Resend is not required for the Relora login flow.
- Accounts are provisioned deliberately by an administrator. The administrator creates the Auth user and provides the initial or temporary password to the employee through an appropriate private channel.
- No shipment, role, RLS, realtime, import, monthly reporting, archive, or dashboard behavior is changed.
- No new database migration is required for v10.4.

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

For an existing v9 database, `relora-v10-migration.sql` only adds safe indexes for Service Month and ETA. It does not delete or rewrite shipment data. If v10.x is already running, v10.4 requires no additional SQL.

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

Relora v10.4 does not need recovery-email SMTP settings to sign users in. If custom SMTP was enabled only for password recovery testing, it can be disabled without affecting normal email/password sign-in.

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

There is no Forgot Password or OTP screen in v10.4. If a user needs a new password, an authorized administrator handles the account through Supabase rather than through Relora's UI.

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

Permanent deletion remains available only to Admin from the Archived view and requires confirmation.

## 8. Roles

- `employee`: own workspace/authorized rows.
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

Recommended acceptance checks: email/password login with an admin-provided password, current month vs upcoming month totals, historical month switching, All Time management view, Select all results + Archive, realtime two-browser edits, conflict dialog, Activity History, Archive/Restore, and Admin-only permanent delete.
