# Relora v10.3


## v10.3 organization branding

Relora remains the product/system name. The sign-in screen and authenticated header now identify **a. hartrodt** as the organization using the internal **Shipment & Customs Operations** portal. No database, authentication, monthly reporting, shipment, or permission logic changed from v10.2.
Relora is a customs brokerage shipment operations system built with React, Supabase, AG Grid, and Netlify. v10.2 keeps the v9 realtime/conflict/audit/archive safeguards and adds **email + password** sign-in, email password recovery, year-aware monthly reporting, and Manager/Admin bulk selection.



## What is fixed in v10.2

- Password recovery now uses a **6-digit recovery code** instead of depending on a clickable reset link.
- Relora verifies the code with Supabase using `verifyOtp({ email, token, type: 'recovery' })` before showing the new-password form.
- This avoids the common email-prefetch problem where corporate mail security opens a one-time recovery link before the user does.
- Invalid/expired codes and email/verification rate limits are translated into user-friendly messages.
- After a successful password change, Relora signs the user out and asks them to sign in again with the new password.
- No database migration is required for v10.2.

### Required Supabase recovery email template

In **Supabase → Authentication → Email Templates → Reset Password**, replace the clickable recovery-link content with a recovery-code template that contains `{{ .Token }}`. For example:

```html
<h2>Reset your Relora password</h2>
<p>Your 6-digit recovery code is:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>Enter this code in Relora. Use only the most recent code you requested.</p>
<p>If you did not request a password reset, you can ignore this email.</p>
```

Do **not** make `{{ .ConfirmationURL }}` the primary reset action for the v10.2 recovery flow. Relora expects the user to type the OTP shown by `{{ .Token }}`.

## What is fixed in v10.1

- Password-recovery emails now return to the dedicated `/reset-password` route instead of the normal app homepage.
- A valid recovery session stays on the **Set new password** form even when Supabase has already created a signed-in session.
- After the password is updated, Relora removes the recovery route and resumes normal authorized access.
- Password-email requests have a short client-side cooldown to reduce accidental repeat sends.
- Supabase email rate-limit responses are translated into a clear message asking the user to wait and check the latest email first.
- Netlify now rewrites SPA routes to `index.html`, so opening `/reset-password` directly does not return a 404.

## What is new in v10

- **Email + password login** replaces the Google login button.
- **Forgot Password** sends a secure 6-digit recovery code to the user's registered email through Supabase Auth.
- The user verifies the recovery code in Relora before the **Set new password** screen is unlocked. Passwords are never stored in `approved_users`, `profiles`, or `shipments`.
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

v10.2 recovery no longer depends on a clickable redirect link. Keep your existing redirect allow-list for backward compatibility, but configure the **Reset Password** email template to show `{{ .Token }}` and configure reliable SMTP for production delivery.

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

Forgot Password / Change Password:

```text
Forgot Password
↓
Enter approved account email
↓
Supabase sends a 6-digit recovery code
↓
Enter the code in Relora
↓
Relora verifies the code as type: recovery
↓
Set new password + confirm password
↓
Password changed
↓
Sign in again
```

A signed-in user can also press **Password** in the top bar. Relora sends the same recovery code to their own registered email and opens the code-verification screen.

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

Recommended acceptance checks: email/password login, Forgot Password recovery-code email, code verification/set-new-password, current month vs upcoming month totals, historical month switching, All Time management view, Select all results + Archive, realtime two-browser edits, conflict dialog, Activity History, Archive/Restore, and Admin-only permanent delete.
