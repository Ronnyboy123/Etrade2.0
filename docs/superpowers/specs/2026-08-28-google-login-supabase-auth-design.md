# Google Login + Supabase Authorization Design

## Goal
Require every user to authenticate with Google before any shipment dashboard or workspace is rendered, and route authorized users into the existing role-based UI using Supabase as the source of truth.

## Authentication flow
1. On first load, the app checks the Supabase session.
2. With no session, only a dedicated login screen is rendered.
3. “Continue with Google” calls Supabase OAuth and returns to the current Netlify/local origin.
4. After OAuth, the app loads the signed-in user’s `profiles` row.
5. If no active approved profile exists, the app signs the user out and shows an access-denied message.
6. If the profile exists, it is converted to the existing app user shape (`role`, `teamId`, `declarantName`) and the existing permission helpers control navigation.
7. Signing out clears the session and returns to the login screen.

## Authorization model
An `approved_users` table is the allow-list managed by company administrators in Supabase. A trigger on `auth.users` creates a `profiles` row only when the Google email is present and active in `approved_users`. Google authentication alone never grants application access.

Roles remain: `employee`, `team_lead`, `assistant_manager`, `manager`, `portal`, and `admin`. Customs Declarants see their own records, TLs see their team, managers/assistant managers see management views, and Portal users see the master view with only Portal/Broker fields editable.

## Data model and persistence
The authenticated application loads `profiles` and `shipments` from Supabase rather than starting with demo rows. Shipment edits, creates, deletes, and imports persist to Supabase. Unknown imported columns are stored in `shipments.custom_fields` JSONB and flattened again when loaded so the existing flexible import UI continues to work.

Portal users cannot directly update shipment rows. Their manual edits continue through the restricted `update_portal_fields` RPC.

## Security requirements
- RLS is enabled on `approved_users`, `profiles`, `shipments`, and activity data.
- Frontend uses only `VITE_SUPABASE_URL` and the public anon/publishable key.
- No Supabase service-role key or Google client secret is stored in React, Git, or Netlify client variables.
- RLS policies use SECURITY DEFINER helper functions to avoid recursive policies on `profiles`.
- Employee inserts/updates/deletes are limited to their own assignment; team leads are limited to their team.
- The application renders no protected business data until authentication and profile authorization finish.

## UI states
The auth gate has four explicit states: checking session, signed out, access denied/error, and authenticated. The login screen uses the existing navy/teal visual language and exposes only the Google button. Authenticated topbar replaces the demo “Preview as” selector with the actual user name, role, email, and Sign Out.

## Netlify/Supabase setup
Supabase Auth must enable Google. Supabase URL Configuration must include the deployed Netlify origin plus localhost for development. Google OAuth must use the Supabase callback URL. Approved users are inserted into `approved_users` before their first successful application access.

## Verification
Node tests cover profile mapping, authorization state, database row serialization/custom fields, and required SQL security structures. The existing 39 tests must remain green. A Vite production build is also required when dependencies are available.
