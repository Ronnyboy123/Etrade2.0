-- Shipment Timeline v8 — Google-only login + approved user access + RLS
-- Run this entire file in Supabase SQL Editor.

-- 1) Company allow-list. Add an email here BEFORE giving the user application access.
create table if not exists public.approved_users (
  email text primary key,
  full_name text not null,
  role text not null default 'employee'
    check (role in ('employee','team_lead','assistant_manager','manager','portal','admin')),
  declarant_name text,
  team_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Authenticated application profiles. These are created/synced from approved_users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'employee'
    check (role in ('employee','team_lead','assistant_manager','manager','portal','admin')),
  declarant_name text,
  team_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- 3) Shipment master table.
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_code text not null unique,
  assigned_user_id uuid references public.profiles(id),
  assigned_to text,
  team_id text,
  service_month text,
  job_file_number text,
  customer text,
  shipper text,
  mode text,
  house_awb_bl text,
  master_awb_bl text,
  pre_alert_shipping_documents date,
  eta date,
  cw_air_cbm_lcl numeric,
  number_of_container integer default 0,
  description text,
  dt_computation date,
  week_no integer,
  fundcast text,
  ata date,
  port_of_entry text,
  location_of_goods text,
  lodgement date,
  assessed date,
  paid date,
  entry_no text,
  selectivity_color text,
  portal_submission date,
  broker_representative text,
  portal_ticket_efile text,
  releasing_date date,
  liquidation_processor date,
  liquidation_tl date,
  endorsement_to_biller date,
  team_leader text,
  customs_declarant text,
  received_folder date,
  billed_date date,
  efile text,
  dispatch date,
  validated_manifest_date date,
  current_stage text default 'PRE-ARRIVAL',
  completion numeric default 0,
  next_action text,
  overall_status text default 'ON TRACK',
  boc_status text default 'PENDING',
  days_open integer default 0,
  last_milestone_date date,
  delay_action_remarks text,
  timeline_duty_tax numeric default 0,
  timeline_lodgement numeric default 0,
  timeline_fan numeric default 0,
  timeline_cargo_releasing numeric default 0,
  timeline_liquidation numeric default 0,
  timeline_liquidation_tl numeric default 0,
  timeline_billing numeric default 0,
  timeline_closing numeric default 0,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shipments add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create table if not exists public.shipment_activity (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  changed_by uuid references public.profiles(id),
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

-- 4) Stable SECURITY DEFINER helpers keep RLS policies from recursively querying profiles.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.current_user_team_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id from public.profiles p
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.current_user_declarant_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.declarant_name from public.profiles p
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_team_id() from public;
revoke all on function public.current_user_declarant_name() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_team_id() to authenticated;
grant execute on function public.current_user_declarant_name() to authenticated;

-- 5) Admit/sync a Google user only when their email exists in approved_users.
create or replace function public.claim_approved_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  approved public.approved_users%rowtype;
  jwt_email text;
begin
  if auth.uid() is null then
    return false;
  end if;

  jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into approved
  from public.approved_users a
  where lower(a.email) = jwt_email
  limit 1;

  if not found then
    update public.profiles set is_active = false, updated_at = now() where id = auth.uid();
    return false;
  end if;

  insert into public.profiles (
    id, email, full_name, role, declarant_name, team_id, is_active, updated_at
  ) values (
    auth.uid(), approved.email, approved.full_name, approved.role,
    approved.declarant_name, approved.team_id, approved.is_active, now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    declarant_name = excluded.declarant_name,
    team_id = excluded.team_id,
    is_active = excluded.is_active,
    updated_at = now();

  return approved.is_active;
end;
$$;

revoke all on function public.claim_approved_profile() from public;
grant execute on function public.claim_approved_profile() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved public.approved_users%rowtype;
begin
  select * into approved
  from public.approved_users a
  where lower(a.email) = lower(coalesce(new.email, ''))
  limit 1;

  if found then
    insert into public.profiles (
      id, email, full_name, role, declarant_name, team_id, is_active, updated_at
    ) values (
      new.id, approved.email, approved.full_name, approved.role,
      approved.declarant_name, approved.team_id, approved.is_active, now()
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      declarant_name = excluded.declarant_name,
      team_id = excluded.team_id,
      is_active = excluded.is_active,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute procedure public.handle_new_auth_user();

-- 6) updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists approved_users_set_updated_at on public.approved_users;
create trigger approved_users_set_updated_at before update on public.approved_users
for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists shipments_set_updated_at on public.shipments;
create trigger shipments_set_updated_at before update on public.shipments
for each row execute procedure public.set_updated_at();

-- 7) RLS.
alter table public.approved_users enable row level security;
alter table public.profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_activity enable row level security;

drop policy if exists "approved users management" on public.approved_users;
create policy "approved users management" on public.approved_users
for all to authenticated
using (public.current_user_role() in ('manager','admin'))
with check (public.current_user_role() in ('manager','admin'));

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "management read profiles" on public.profiles;
drop policy if exists "profiles read authorized" on public.profiles;
create policy "profiles read authorized" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() in ('manager','assistant_manager','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
);

drop policy if exists "shipment read access" on public.shipments;
create policy "shipment read access" on public.shipments
for select to authenticated
using (
  public.current_user_role() in ('manager','assistant_manager','portal','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
  or (
    public.current_user_role() = 'employee'
    and (
      assigned_user_id = auth.uid()
      or lower(coalesce(assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    )
  )
);

drop policy if exists "shipment insert access" on public.shipments;
create policy "shipment insert access" on public.shipments
for insert to authenticated
with check (
  public.current_user_role() in ('manager','assistant_manager','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
  or (
    public.current_user_role() = 'employee'
    and team_id = public.current_user_team_id()
    and (
      assigned_user_id = auth.uid()
      or lower(coalesce(assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    )
  )
);

drop policy if exists "shipment update access" on public.shipments;
create policy "shipment update access" on public.shipments
for update to authenticated
using (
  public.current_user_role() in ('manager','assistant_manager','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
  or (
    public.current_user_role() = 'employee'
    and (
      assigned_user_id = auth.uid()
      or lower(coalesce(assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    )
  )
)
with check (
  public.current_user_role() in ('manager','assistant_manager','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
  or (
    public.current_user_role() = 'employee'
    and team_id = public.current_user_team_id()
    and (
      assigned_user_id = auth.uid()
      or lower(coalesce(assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    )
  )
);

drop policy if exists "shipment delete access" on public.shipments;
create policy "shipment delete access" on public.shipments
for delete to authenticated
using (
  public.current_user_role() in ('manager','assistant_manager','admin')
  or (public.current_user_role() = 'team_lead' and team_id = public.current_user_team_id())
  or (
    public.current_user_role() = 'employee'
    and (
      assigned_user_id = auth.uid()
      or lower(coalesce(assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    )
  )
);

-- 8) Portal/Broker users use this RPC so only the approved three fields can change.
create or replace function public.update_portal_fields(
  p_shipment_id uuid,
  p_portal_submission date,
  p_broker_representative text,
  p_portal_ticket_efile text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('portal','manager','assistant_manager','admin') then
    raise exception 'Not authorized';
  end if;

  update public.shipments
  set portal_submission = p_portal_submission,
      broker_representative = p_broker_representative,
      portal_ticket_efile = p_portal_ticket_efile,
      updated_at = now()
  where id = p_shipment_id;
end;
$$;

revoke all on function public.update_portal_fields(uuid,date,text,text) from public;
grant execute on function public.update_portal_fields(uuid,date,text,text) to authenticated;

-- 9) Table privileges. RLS remains the enforcement layer.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.shipments to authenticated;
grant select, insert, update, delete on public.approved_users to authenticated;

-- Example allow-list records (replace emails before running these):
-- insert into public.approved_users (email, full_name, role, declarant_name, team_id)
-- values
--   ('manager@company.com', 'Manager Name', 'manager', null, null),
--   ('rona@company.com', 'Rona', 'team_lead', null, 'team1'),
--   ('andrea@company.com', 'Andrea', 'employee', 'Andrea', 'team2'),
--   ('portal1@company.com', 'Portal User 1', 'portal', null, null)
-- on conflict (email) do update set
--   full_name = excluded.full_name,
--   role = excluded.role,
--   declarant_name = excluded.declarant_name,
--   team_id = excluded.team_id,
--   is_active = true;
