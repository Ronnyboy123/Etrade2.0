# Shipment Timeline v8

Google-only login + Supabase authorization + persistent shipment data.

## What changed in v8

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
- Shipment rows are loaded from Supabase after login.
- Manual edits, new shipments, deletes, and imports persist to Supabase.
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
- Can add/import/edit/delete own authorized rows

### Team Lead
- Dashboard
- Team Workspaces for their own team
- Can edit their team records

### Assistant Manager
- Dashboard
- Master Shipments
- All Team Workspaces

### Manager / Admin
- Full operational access

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
