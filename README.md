# Relora v10.1

Relora is a customs brokerage shipment operations system built with React, Supabase, AG Grid, and Netlify. v10.1 keeps the v9 realtime/conflict/audit/archive safeguards and adds **email + password** sign-in, email password recovery, year-aware monthly reporting, and Manager/Admin bulk selection.


## What is fixed in v10.1

- Password-recovery emails now return to the dedicated `/reset-password` route instead of the normal app homepage.
- A valid recovery session stays on the **Set new password** form even when Supabase has already created a signed-in session.
- After the password is updated, Relora removes the recovery route and resumes normal authorized access.
- Password-email requests have a short client-side cooldown to reduce accidental repeat sends.
- Supabase email rate-limit responses are translated into a clear message asking the user to wait and check the latest email first.
- Netlify now rewrites SPA routes to `index.html`, so opening `/reset-password` directly does not return a 404.

## What is new in v10

- **Email + password login** replaces the Google login button.
- **Forgot Password** sends a secure recovery link to the user's registered email through Supabase Auth.
- A recovery link opens Relora's **Set new password** screen. Passwords are never stored in `approved_users`, `profiles`, or `shipments`.
- Signed-in users can press **Password** to send a password-change email to their own account.
- **Monthly reporting** defaults to the current month and is year-aware.
- Official shipment month uses **Service Month** first, with **fallback to ETA** when Service Month is blank/unusable.
- Example: a September 2026 shipment is **not counted in August 2026**, even if it was uploaded while August is selected.
- Users can switch to available past/future months. Management users also get **All Time**.
- Dashboard KPIs, KPI drilldowns, Team Workspaces, My Workspace, Master Shipments, Archived view, search results, bulk actions, and Excel exports use the selected reporting month.
- Manager/Admin can use **Select all results** for the current month/filter result set, then Archive Selected.
- Active shipments are archived, not permanently deleted. **Admin is still the only role allowed to permanently delete** archived records.

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

## 2. Database upgrade

For an existing v9 database, run `relora-v10-migration.sql` in **Supabase → SQL Editor**. It only adds safe indexes for Service Month and ETA; it does not delete or rewrite shipment data.

For a fresh project, run the complete `supabase-schema.sql`.

The application still uses:

- `approved_users` as the company allow-list
- `profiles` for application role/team identity
- Supabase RLS as the authorization boundary
- `shipments` as the source of truth
- `shipment_activity` for leadership history

## 3. Create password users safely

Relora does not have public signup. Provision accounts deliberately:

1. Add the employee's email and role to `public.approved_users`.
2. In **Supabase → Authentication → Users**, create/invite the Auth user with the **same email**.
3. The user signs in with that email/password. Relora calls `claim_approved_profile()` and loads the role/team only when the email is approved and active.
4. If a person leaves, set `approved_users.is_active = false`. Keep their profile/history instead of deleting identity records.

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

Managers never need to know an employee's password.

## 4. Supabase Auth configuration

In **Authentication → Providers**, keep Email authentication enabled. Google may be disabled once the team has moved to email/password accounts.

In **Authentication → URL Configuration**, set the production Site URL and add redirect URLs for production/local development, for example:

```text
https://relora.netlify.app/**
https://relora.netlify.app/reset-password
http://localhost:5173/**
http://localhost:5174/**
```

Forgot-password and password-change emails return specifically to `/reset-password`. Keep that route (or the production `/**` wildcard) in the allowed redirect list. For production use, configure reliable outgoing email/SMTP in Supabase so recovery emails reach company users consistently.

## 5. Login and password flow

```text
Relora login
↓
Email + password
↓
Supabase Auth verifies credentials
↓
approved_users + profile/RLS authorization check
↓
Authorized workspace
```

Forgot Password:

```text
Forgot Password
↓
Enter approved account email
↓
Supabase sends recovery email
↓
Open link
↓
Relora: /reset-password
↓
Set new password
```

A signed-in user can also press **Password** in the top bar to send the same secure change link to their own email.

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

The current calendar month is selected by default. Historical months stay available, and management users can choose **All Time**.

## 7. Bulk shipment actions

Manager/Admin get an explicit **Select all results** action. It selects only rows in the current reporting month and current search/grid filter result set. Changing month/search scope clears the selection so rows from another period cannot be accidentally carried into a bulk action.

For active records:

```text
Select all results → Archive Selected
```

Permanent deletion remains available only to Admin from the Archived view and still requires confirmation.

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

Then deploy from the GitHub-connected project. After deployment, hard-refresh users (`Ctrl + Shift + R`).

Recommended acceptance checks: email/password login, Forgot Password email, recovery link/set-new-password, current month vs upcoming month totals, historical month switching, All Time management view, Select all results + Archive, realtime two-browser edits, conflict dialog, Activity History, Archive/Restore, and Admin-only permanent delete.
