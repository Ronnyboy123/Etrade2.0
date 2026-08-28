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

-- ============================================================================
-- Relora v9 — Reliability, Realtime, conflict-safe writes, archive and audit
-- ============================================================================

-- v9 shipment concurrency/archive metadata.
alter table public.shipments add column if not exists version bigint not null default 1;
alter table public.shipments add column if not exists archived_at timestamptz;
alter table public.shipments add column if not exists archived_by uuid references public.profiles(id);

-- v9 activity metadata. Existing v8 rows remain readable.
alter table public.shipment_activity add column if not exists action_type text;
alter table public.shipment_activity add column if not exists actor_email text;
alter table public.shipment_activity add column if not exists actor_name text;
alter table public.shipment_activity add column if not exists source text;
update public.shipment_activity set action_type = coalesce(action_type, 'legacy_edit') where action_type is null;
update public.shipment_activity set source = coalesce(source, 'legacy') where source is null;
alter table public.shipment_activity alter column action_type set default 'field_edit';
alter table public.shipment_activity alter column action_type set not null;
alter table public.shipment_activity alter column source set default 'system';
alter table public.shipment_activity alter column source set not null;

create index if not exists shipments_active_created_idx on public.shipments (archived_at, created_at desc);
create index if not exists shipments_team_active_idx on public.shipments (team_id, archived_at);
create index if not exists shipment_activity_shipment_created_idx on public.shipment_activity (shipment_id, created_at desc);

-- Internal authorization helper used by SECURITY DEFINER write functions.
create or replace function public.v9_can_mutate_shipment(p_shipment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shipments s
    where s.id = p_shipment_id
      and (
        public.current_user_role() in ('manager','assistant_manager','admin')
        or (public.current_user_role() = 'team_lead' and s.team_id = public.current_user_team_id())
        or (
          public.current_user_role() = 'employee'
          and (
            s.assigned_user_id = auth.uid()
            or lower(coalesce(s.assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
          )
        )
        or public.current_user_role() = 'portal'
      )
  );
$$;

revoke all on function public.v9_can_mutate_shipment(uuid) from public;

-- Internal dynamic patch helper. It only accepts real shipment columns or
-- custom__ keys and refuses database-managed/archive/concurrency fields.
create or replace function public.v9_apply_shipment_patch(
  p_shipment_id uuid,
  p_patch jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  kv record;
  type_sql text;
begin
  for kv in select key, value from jsonb_each(coalesce(p_patch, '{}'::jsonb)) loop
    if kv.key in ('id','created_at','updated_at','version','archived_at','archived_by') then
      continue;
    end if;

    if kv.key like 'custom__%' then
      update public.shipments
      set custom_fields = jsonb_set(
        coalesce(custom_fields, '{}'::jsonb),
        array[kv.key],
        coalesce(kv.value, 'null'::jsonb),
        true
      )
      where id = p_shipment_id;
      continue;
    end if;

    select format_type(a.atttypid, a.atttypmod)
      into type_sql
    from pg_attribute a
    where a.attrelid = 'public.shipments'::regclass
      and a.attname = kv.key
      and a.attnum > 0
      and not a.attisdropped;

    if type_sql is null then
      continue;
    end if;

    execute format(
      'update public.shipments set %I = ($1 #>> ''{}'')::%s where id = $2',
      kv.key,
      type_sql
    ) using kv.value, p_shipment_id;
  end loop;
end;
$$;

revoke all on function public.v9_apply_shipment_patch(uuid,jsonb) from public;

create or replace function public.create_shipment(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.shipments%rowtype;
  v_role text := public.current_user_role();
  v_code text := nullif(trim(coalesce(p_row ->> 'shipment_code','')), '');
  v_team text := p_row ->> 'team_id';
  v_assigned text := p_row ->> 'assigned_to';
  v_assigned_user uuid;
begin
  if v_code is null then
    raise exception 'Shipment code is required';
  end if;

  begin
    v_assigned_user := nullif(p_row ->> 'assigned_user_id','')::uuid;
  exception when invalid_text_representation then
    v_assigned_user := null;
  end;

  if not (
    v_role in ('manager','assistant_manager','admin')
    or (v_role = 'team_lead' and v_team = public.current_user_team_id())
    or (
      v_role = 'employee'
      and v_team = public.current_user_team_id()
      and (
        v_assigned_user = auth.uid()
        or lower(coalesce(v_assigned,'')) = lower(coalesce(public.current_user_declarant_name(),''))
      )
    )
  ) then
    raise exception 'Not authorized to create this shipment';
  end if;

  insert into public.shipments (shipment_code) values (v_code) returning id into v_id;
  perform public.v9_apply_shipment_patch(v_id, p_row);
  select * into v_row from public.shipments where id = v_id;

  insert into public.shipment_activity (
    shipment_id, changed_by, action_type, actor_email, actor_name, source, old_value, new_value
  )
  select v_id, auth.uid(), 'create', p.email, p.full_name, 'grid', null, v_code
  from public.profiles p where p.id = auth.uid();

  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_shipment_field(
  p_shipment_id uuid,
  p_field_name text,
  p_new_value jsonb,
  p_base_version bigint,
  p_base_value jsonb,
  p_force boolean default false,
  p_derived jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.shipments%rowtype;
  v_after public.shipments%rowtype;
  v_current jsonb;
  v_role text := public.current_user_role();
  v_safe_derived jsonb := '{}'::jsonb;
  v_patch jsonb;
begin
  select * into v_before from public.shipments where id = p_shipment_id for update;
  if not found then
    raise exception 'Shipment not found';
  end if;

  if not public.v9_can_mutate_shipment(p_shipment_id) then
    raise exception 'Not authorized';
  end if;

  if p_field_name in (
    'id','created_at','updated_at','version','archived_at','archived_by',
    'shipment_code','assigned_user_id','assigned_to','team_id','custom_fields'
  ) then
    raise exception 'Protected shipment field';
  end if;

  if v_role = 'portal' and p_field_name not in ('portal_submission','broker_representative','portal_ticket_efile') then
    raise exception 'Portal users cannot edit this field';
  end if;

  if p_field_name like 'custom__%' then
    v_current := coalesce(v_before.custom_fields, '{}'::jsonb) -> p_field_name;
  else
    v_current := to_jsonb(v_before) -> p_field_name;
  end if;

  if not p_force
     and coalesce(v_before.version, 1) <> coalesce(p_base_version, 1)
     and v_current is distinct from p_base_value then
    return jsonb_build_object(
      'status', 'conflict',
      'row', to_jsonb(v_before),
      'current_value', v_current,
      'server_version', v_before.version
    );
  end if;

  -- Derived workflow values are trusted only when the client started from the
  -- current row version. On a different-field concurrent merge, the browser's
  -- derived values may be stale even though its edited field is safe to merge.
  if coalesce(v_before.version, 1) = coalesce(p_base_version, 1) then
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      into v_safe_derived
    from jsonb_each(coalesce(p_derived, '{}'::jsonb))
    where key in (
      'validated_manifest_date','current_stage','completion','next_action','overall_status','boc_status',
      'days_open','last_milestone_date','delay_action_remarks','timeline_duty_tax','timeline_lodgement',
      'timeline_fan','timeline_cargo_releasing','timeline_liquidation','timeline_liquidation_tl',
      'timeline_billing','timeline_closing'
    );
  else
    v_safe_derived := '{}'::jsonb;
  end if;

  v_patch := coalesce(v_safe_derived, '{}'::jsonb) || jsonb_build_object(p_field_name, p_new_value);
  perform public.v9_apply_shipment_patch(p_shipment_id, v_patch);

  update public.shipments
  set version = coalesce(version, 1) + 1
  where id = p_shipment_id
  returning * into v_after;

  insert into public.shipment_activity (
    shipment_id, changed_by, action_type, actor_email, actor_name, field_name,
    old_value, new_value, source
  )
  select
    p_shipment_id,
    auth.uid(),
    case when p_force then 'conflict_override' else 'field_edit' end,
    p.email,
    p.full_name,
    p_field_name,
    case when v_current is null then null else v_current #>> '{}' end,
    case when p_new_value is null then null else p_new_value #>> '{}' end,
    case when p_force then 'conflict' else 'grid' end
  from public.profiles p where p.id = auth.uid();

  return jsonb_build_object('status', 'saved', 'row', to_jsonb(v_after));
end;
$$;

create or replace function public.archive_shipments(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.shipments%rowtype;
  v_count integer := 0;
  v_role text := public.current_user_role();
begin
  if v_role not in ('team_lead','manager','admin') then
    raise exception 'Not authorized to archive shipments';
  end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    select * into v_row from public.shipments where id = v_id for update;
    if not found then continue; end if;
    if v_role = 'team_lead' and v_row.team_id is distinct from public.current_user_team_id() then
      raise exception 'Not authorized to archive a shipment outside your team';
    end if;
    if v_row.archived_at is null then
      update public.shipments
      set archived_at = now(), archived_by = auth.uid(), version = version + 1
      where id = v_id;
      insert into public.shipment_activity (
        shipment_id, changed_by, action_type, actor_email, actor_name, source
      )
      select v_id, auth.uid(), 'archive', p.email, p.full_name, 'archive'
      from public.profiles p where p.id = auth.uid();
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.restore_shipments(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.shipments%rowtype;
  v_count integer := 0;
  v_role text := public.current_user_role();
begin
  if v_role not in ('team_lead','manager','admin') then
    raise exception 'Not authorized to restore shipments';
  end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    select * into v_row from public.shipments where id = v_id for update;
    if not found then continue; end if;
    if v_role = 'team_lead' and v_row.team_id is distinct from public.current_user_team_id() then
      raise exception 'Not authorized to restore a shipment outside your team';
    end if;
    if v_row.archived_at is not null then
      update public.shipments
      set archived_at = null, archived_by = null, version = version + 1
      where id = v_id;
      insert into public.shipment_activity (
        shipment_id, changed_by, action_type, actor_email, actor_name, source
      )
      select v_id, auth.uid(), 'restore', p.email, p.full_name, 'restore'
      from public.profiles p where p.id = auth.uid();
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.admin_delete_shipments(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Permanent deletion is Admin only';
  end if;

  delete from public.shipments where id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Import writes are one server transaction. Rows have already passed the
-- browser's conflict-review step before they reach this function.
create or replace function public.persist_import_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_code text;
  v_id uuid;
  v_before public.shipments%rowtype;
  v_after public.shipments%rowtype;
  v_role text := public.current_user_role();
  v_team text;
  v_assigned text;
  v_assigned_user uuid;
  v_result jsonb := '[]'::jsonb;
  v_action text;
  v_intent text;
  v_expected_version bigint;
begin
  if v_role not in ('employee','team_lead','assistant_manager','manager','admin') then
    raise exception 'Not authorized to import shipments';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_code := nullif(trim(coalesce(item ->> 'shipment_code','')), '');
    v_intent := coalesce(item ->> '_relora_import_intent', '');
    begin
      v_expected_version := nullif(item ->> '_relora_expected_version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Invalid import review version for shipment %', v_code;
    end;
    if v_code is null then
      raise exception 'Import row is missing shipment_code';
    end if;

    select * into v_before from public.shipments where shipment_code = v_code for update;

    if found then
      v_id := v_before.id;
      if v_intent = 'create' then
        raise exception 'Shipment % changed after import review: it now exists. Re-open the import preview.', v_code;
      end if;
      if v_expected_version is not null and coalesce(v_before.version, 1) <> v_expected_version then
        raise exception 'Shipment % changed after import review. Re-open the import preview before syncing.', v_code;
      end if;
      if not public.v9_can_mutate_shipment(v_id) or v_role = 'portal' then
        raise exception 'Not authorized to update imported shipment %', v_code;
      end if;
      perform public.v9_apply_shipment_patch(v_id, item);
      update public.shipments set version = version + 1 where id = v_id returning * into v_after;
      v_action := 'import_update';
    else
      if v_intent = 'update' then
        raise exception 'Shipment % changed after import review: it no longer exists. Re-open the import preview.', v_code;
      end if;
      v_team := item ->> 'team_id';
      v_assigned := item ->> 'assigned_to';
      begin
        v_assigned_user := nullif(item ->> 'assigned_user_id','')::uuid;
      exception when invalid_text_representation then
        v_assigned_user := null;
      end;

      if not (
        v_role in ('manager','assistant_manager','admin')
        or (v_role = 'team_lead' and v_team = public.current_user_team_id())
        or (
          v_role = 'employee'
          and v_team = public.current_user_team_id()
          and (
            v_assigned_user = auth.uid()
            or lower(coalesce(v_assigned,'')) = lower(coalesce(public.current_user_declarant_name(),''))
          )
        )
      ) then
        raise exception 'Not authorized to create imported shipment %', v_code;
      end if;

      insert into public.shipments (shipment_code) values (v_code) returning id into v_id;
      perform public.v9_apply_shipment_patch(v_id, item);
      select * into v_after from public.shipments where id = v_id;
      v_action := 'import_insert';
    end if;

    insert into public.shipment_activity (
      shipment_id, changed_by, action_type, actor_email, actor_name, source, old_value, new_value
    )
    select
      v_id, auth.uid(), v_action, p.email, p.full_name, 'import',
      case when v_action = 'import_update' then v_before.shipment_code else null end,
      v_after.shipment_code
    from public.profiles p where p.id = auth.uid();

    v_result := v_result || jsonb_build_array(to_jsonb(v_after));
  end loop;

  return v_result;
end;
$$;

-- Activity history is leadership-only and still respects shipment visibility.
drop policy if exists "shipment activity read access" on public.shipment_activity;
create policy "shipment activity read access" on public.shipment_activity
for select to authenticated
using (
  public.current_user_role() in ('team_lead','manager','admin')
  and exists (
    select 1 from public.shipments s
    where s.id = shipment_activity.shipment_id
  )
);

-- Defense in depth: normal clients read shipments directly, but all v9 writes
-- go through explicitly authorized SECURITY DEFINER functions.
revoke insert, update, delete on public.shipments from authenticated;
grant select on public.shipments to authenticated;
revoke insert, update, delete on public.shipment_activity from authenticated;
grant select on public.shipment_activity to authenticated;

revoke all on function public.create_shipment(jsonb) from public;
revoke all on function public.update_shipment_field(uuid,text,jsonb,bigint,jsonb,boolean,jsonb) from public;
revoke all on function public.archive_shipments(uuid[]) from public;
revoke all on function public.restore_shipments(uuid[]) from public;
revoke all on function public.admin_delete_shipments(uuid[]) from public;
revoke all on function public.persist_import_batch(jsonb) from public;
grant execute on function public.create_shipment(jsonb) to authenticated;
grant execute on function public.update_shipment_field(uuid,text,jsonb,bigint,jsonb,boolean,jsonb) to authenticated;
grant execute on function public.archive_shipments(uuid[]) to authenticated;
grant execute on function public.restore_shipments(uuid[]) to authenticated;
grant execute on function public.admin_delete_shipments(uuid[]) to authenticated;
grant execute on function public.persist_import_batch(jsonb) to authenticated;

-- v8 portal writes bypass v9 version/conflict/audit handling, so authenticated
-- clients must no longer be able to call the legacy RPC after this migration.
revoke all on function public.update_portal_fields(uuid,date,text,text) from authenticated;

-- Direct DELETE is Admin-only even if a future deployment restores table write
-- privileges. Current v9 clients use admin_delete_shipments instead.
drop policy if exists "shipment delete access" on public.shipments;
create policy "shipment delete access" on public.shipments
for delete to authenticated
using (public.current_user_role() = 'admin');

-- Realtime needs the shipments table in Supabase's publication. The DO block is
-- rerunnable and does nothing when the table is already registered.
alter table public.shipments replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'shipments'
     ) then
    alter publication supabase_realtime add table public.shipments;
  end if;
end;
$$;
