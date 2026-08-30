-- Relora v10 migration from a working v9 database.
-- This migration does not delete or rewrite existing shipment records.
-- Email/password credentials stay in Supabase Auth, not public Relora tables.

begin;

-- Helpful for the new month reporting/filtering path and future server-side month queries.
create index if not exists shipments_service_month_idx
  on public.shipments (service_month);

create index if not exists shipments_eta_idx
  on public.shipments (eta);

commit;

-- After running this migration:
-- 1) Keep Email authentication enabled in Supabase Auth.
-- 2) Add/invite each user in Supabase Authentication using the SAME email in approved_users.
-- 3) Configure Site URL / Redirect URLs so Forgot Password links return to Relora.
-- 4) Google provider may be disabled once no users depend on Google login.
