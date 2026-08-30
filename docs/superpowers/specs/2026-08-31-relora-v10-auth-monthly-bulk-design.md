# Relora v10 Authentication, Monthly Reporting, and Bulk Actions Design

## Goal
Replace Google OAuth with approved-user email/password authentication, organize active shipment views and reporting by official month, support password recovery/change by email, and give Manager/Admin safe bulk shipment selection/actions.

## Authentication
- Supabase remains the authentication provider.
- Login UI uses email + password only; Google OAuth controls are removed.
- Company access remains gated by `approved_users` + active `profiles` + RLS.
- Self-service public signup is not added.
- Forgot Password sends a Supabase recovery link to the entered email.
- A PASSWORD_RECOVERY session opens a Set New Password form; the password is updated with Supabase Auth and never stored in Relora tables.
- Signed-in users can request a password-change email to their registered email.
- Managers never see or manage raw passwords.

## Official Shipment Month
- Official month is Service Month when present.
- If Service Month is blank/unusable, ETA month is the fallback.
- Month keys are year-aware (`2026-09` is not `2027-09`).
- Service Month text may include a year (e.g. `September 2026`, `Sep-2026`, `09/2026`).
- If Service Month has a month but no year, year is inferred from ETA first, then other dated shipment milestones, then current year.
- Current month is selected by default.
- Upcoming shipments remain in their official upcoming month and are excluded from the current month totals.
- Users can switch to past/future months present in data.
- Management users also receive an All Time option.
- The selected month scopes dashboards, workspace rows, KPI drilldowns, search results, bulk selection, and exports because those components receive the month-filtered row set.

## Bulk Actions
- Existing row checkboxes remain.
- Manager/Admin get a `Select all results` action that selects every row in the current month/filter result set, not hidden rows from other months.
- Active-table delete remains Archive, never permanent delete.
- Admin-only permanent deletion remains in Archived view with explicit confirmation.
- Bulk selection resets when month/filter context changes to avoid carrying selections into another reporting period.

## Data Safety
- No existing shipment records are deleted or rewritten as part of v10 deployment.
- v9 realtime/conflict/activity/archive protections remain intact.
- Passwords remain exclusively in Supabase Auth.
- RLS remains the authorization boundary; replacing Google OAuth does not weaken row access policies.
