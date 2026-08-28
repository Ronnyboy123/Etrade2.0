# Relora v9

Customs brokerage shipment operations with Google-only login, Supabase authorization, persistent data, realtime collaboration, conflict protection, archive/restore, and leadership audit history.

## Relora v9 reliability upgrade

- Users must sign in before seeing any shipment/dashboard screen.
- Google OAuth is handled by Supabase Auth.
- Google login alone does **not** grant access: the email must exist in `approved_users`.
- Roles come from Supabase, not the old demo “Preview as” switcher.
- Existing roles are supported:
  - Customs Declarant (`employee`)
  - Team Lead (`team_lead`)
  - Assistant Manager (`assistant_manager`)
  - Manager (`manager`)
  - Portal / Broker (`portal`)
  - Admin (`admin`)
- Shipment rows are loaded from Supabase after login and receive authorized Supabase Realtime updates.
- Manual edits, new shipments, archive/restore actions, and reviewed imports persist to Supabase.
- Save state is visible as Saved, Saving…, Offline, Reconnecting…, or Sync issue.
- Same-field concurrent edits are protected by an explicit conflict review; different-field realtime updates can merge without stomping the active editor.
- Activity History is visible only to Team Lead, Manager, and Admin roles.
- Team Leads, Managers, and Admins can Archive/Restore. A permanent delete is restricted to Admin only.
- Older Excel values can be flagged for review instead of silently overwriting newer Relora data.
- Unknown imported columns are stored in `custom_fields` JSONB.
- Portal users still have restricted edit access to only:
  - Portal Submission Date
  - Broker Representative
  - Portal Ticket / eFile

## 1. Local install

```bash
npm install
```

Copy `.env.example` to `.env`:

```text
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Do **not** put a Supabase service-role key or Google client secret in this file.

Run:

```bash
npm run dev
```

## 2. Supabase database setup

Open **Supabase → SQL Editor** and run the entire `supabase-schema.sql` file.

This creates/updates:

- `approved_users`
- `profiles`
- `shipments`
- `shipment_activity`
- `custom_fields` JSONB support
- approved-user sync functions/triggers
- role helper functions
- RLS policies
- restricted Portal/Broker edit RPC

### Add the first approved users

Use the SQL Editor. Replace the example emails with real company Google accounts:

```sql
insert into public.approved_users
  (email, full_name, role, declarant_name, team_id)
values
  ('manager@company.com', 'Manager Name', 'manager', null, null),
  ('rona@company.com', 'Rona', 'team_lead', null, 'team1'),
  ('andrea@company.com', 'Andrea', 'employee', 'Andrea', 'team2'),
  ('portal1@company.com', 'Portal User 1', 'portal', null, null)
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  declarant_name = excluded.declarant_name,
  team_id = excluded.team_id,
  is_active = true;
```

Use the exact email the employee uses with Google.

### Team examples

```text
team1 → Team 1
team2 → Team 2
team3 → Team 3
```

For a Customs Declarant, set both:

```text
role = employee
declarant_name = their name used in shipment rows
```

## 3. Enable Google provider in Supabase

In **Supabase → Authentication → Providers → Google**:

1. Enable Google.
2. Add the Google OAuth Client ID.
3. Add the Google OAuth Client Secret.
4. Copy the Supabase callback URL shown there. It normally looks like:

```text
https://YOUR-PROJECT.supabase.co/auth/v1/callback
```

That callback URL is what you add to the Google OAuth configuration as an authorized redirect URI.

## 4. Configure Google OAuth

In your Google Cloud project:

1. Create/configure an OAuth 2.0 Web application.
2. Add the Supabase callback URL as an **Authorized redirect URI**.
3. Put the Client ID and Client Secret in the Supabase Google provider settings.

The Google secret stays in Supabase/Google configuration — never in React.

## 5. Supabase URL Configuration

In **Supabase → Authentication → URL Configuration**:

Set your production Site URL to your real Netlify site, for example:

```text
https://your-shipment-site.netlify.app
```

Add Redirect URLs for both production and local development:

```text
https://your-shipment-site.netlify.app/**
http://localhost:5173/**
http://localhost:5174/**
```

Use the exact localhost port Vite gives you.

## 6. Netlify environment variables

In **Netlify → Site configuration → Environment variables**, add:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Use only the public/publishable (or legacy anon) key.

Then redeploy the site.

## 7. Login behavior

The application flow is:

```text
Visit website
↓
Login screen only
↓
Continue with Google
↓
Supabase verifies Google session
↓
Email checked against approved_users
↓
Approved → profile/role loaded → correct workspace
Not approved → Access Not Approved screen
```

Someone knowing the Netlify URL cannot see shipment data without both a valid Google session and an approved role/profile.

## 8. Role behavior

### Customs Declarant
- My Workspace only
- Own assigned shipments only
- Can add/import/edit own authorized rows; no archive or permanent delete access

### Team Lead
- Dashboard
- Team Workspaces for their own team
- Can edit their team records
- Can Archive/Restore authorized team shipments
- Can view Activity History for authorized shipments

### Assistant Manager
- Dashboard
- Master Shipments
- All Team Workspaces

### Manager
- Full operational visibility
- Can Archive/Restore shipments
- Can view Activity History
- Cannot permanently delete

### Admin
- Full operational access
- Can Archive/Restore
- Can view Activity History
- Only role allowed to permanently delete archived shipments

### Portal / Broker
- Master Shipments
- Can see all shipment rows
- Can edit only Portal Submission Date, Broker Representative, Portal Ticket / eFile
- No bulk delete/import access

## 9. Testing

```bash
npm test
```

Production build:

```bash
npm run build
```

## Important production notes

- Keep RLS enabled.
- Never use a Supabase service-role key in Vite/Netlify browser variables.
- Never commit `.env`.
- Keep uploaded business files in private Supabase Storage if file storage is added later.
- Remove/deactivate people in `approved_users` when they should no longer access the system. On the next access check their profile will be disabled.

## v8.1 date import fix

Excel date cells are now read as real dates instead of display-formatted text such as `1-Jul`. Before saving to Supabase, all recognized date fields are normalized to PostgreSQL-safe `YYYY-MM-DD` values. Short `d-mmm` text dates use the shipment service month to infer the year when needed.

## v8.3 date-placeholder fix

Excel placeholders such as `N/A`, `NA`, `N.A.`, `NONE`, `Not Applicable`, `-`, and `—` are treated as empty only when they are used in date-driven workflow fields. This prevents PostgreSQL/Supabase date errors and prevents placeholder text from incorrectly advancing Current Stage or BOC Status.


## v8.4 import retry safety

- Excel/CSV import persistence now uses one atomic Supabase upsert batch keyed by `shipment_code`.
- Retrying the same file after a previous failed sync updates already-created shipment codes instead of violating the unique constraint.
- The whole batch succeeds or fails together, preventing new partial imports from leaving only part of the file saved.

## v8.5 date import hardening

- Spreadsheet placeholders such as `.`, `..`, `...`, `TBA`, `TBD`, `NIL`, `N/A`, blanks, and dashes are stored as empty dates instead of being sent to PostgreSQL date columns.
- Unrecognized or malformed date text is normalized to `null` at the Supabase serialization boundary, preventing a single bad spreadsheet date from crashing the entire import.
- Valid Excel Date objects and supported date strings continue to normalize to `YYYY-MM-DD`.


## v9 production deployment note

The v9 `supabase-schema.sql` adds shipment versions, archive metadata, activity fields, write RPCs, RLS changes, and Supabase Realtime publication setup. It also revokes direct browser writes to `shipments` so changes flow through the safer v9 RPCs.

For the first production upgrade, use a short **maintenance window** so users are not editing while the frontend and database schema are temporarily on different versions. Keep the current production site closed to editing, run the complete `supabase-schema.sql` in Supabase SQL Editor, then immediately deploy the v9 frontend from Netlify/GitHub. After deployment, test with two approved accounts in separate browsers before reopening normal work.

The migration intentionally makes old v8 write calls incompatible with the new write restrictions. Do not leave the v8 frontend running for normal users after applying the v9 database migration.

## v9 safety behavior

- **Realtime:** authorized INSERT/UPDATE/DELETE shipment events update open sessions without a manual refresh.
- **Conflict protection:** a same-field concurrent edit shows the current server value and the user's proposed value instead of silently overwriting either one.
- **Offline:** Relora is read-only for mutations while offline. v9 does not queue offline edits for later replay.
- **Archive:** Team Lead, Manager, and Admin can archive/restore authorized shipments. Archived rows disappear from active workspaces.
- **Permanent delete:** Admin only, from the Archived view, with confirmation.
- **Activity History:** Team Lead, Manager, and Admin only. It records meaningful field edits, conflict overrides, imports, archive, and restore actions.
- **Import review:** blank imported cells do not erase populated Relora values. If the server row is newer than the uploaded file or a BOC status would move backward, the user must choose Keep Relora or Use Imported before sync.

## v9 recommended acceptance test

Open the deployed site in two browsers using two approved users. Edit different fields on the same shipment and confirm both values survive. Then edit the same field in both browsers and confirm Relora shows the conflict dialog. Verify Archive removes the row from active workspaces, Restore brings it back, a non-Admin cannot permanently delete, and Activity History is not visible to employee/assistant-manager/portal accounts.
