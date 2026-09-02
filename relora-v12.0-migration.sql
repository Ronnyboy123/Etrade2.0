-- Relora v12.0 — shipment master + exact-synced imported detail lines.
-- Apply after the v11.x schema/migrations.

create table if not exists public.shipment_import_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  line_key text not null,
  source_sheet text,
  source_row_number integer,
  source_section text,
  raw_cells jsonb not null default '[]'::jsonb,
  normalized_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipment_id, line_key)
);

create index if not exists shipment_import_lines_shipment_idx on public.shipment_import_lines (shipment_id);
create index if not exists shipment_import_lines_source_idx on public.shipment_import_lines (shipment_id, source_sheet, source_row_number);

drop trigger if exists shipment_import_lines_set_updated_at on public.shipment_import_lines;
create trigger shipment_import_lines_set_updated_at
before update on public.shipment_import_lines
for each row execute procedure public.set_updated_at();

alter table public.shipment_import_lines enable row level security;

drop policy if exists "shipment import lines read access" on public.shipment_import_lines;
create policy "shipment import lines read access"
on public.shipment_import_lines
for select to authenticated
using (
  exists (
    select 1 from public.shipments s
    where s.id = shipment_import_lines.shipment_id
      and (
        public.current_user_role() in ('manager','assistant_manager','portal','admin')
        or (public.current_user_role() = 'team_lead' and s.team_id = public.current_user_team_id())
        or (
          public.current_user_role() = 'employee'
          and (
            s.assigned_user_id = auth.uid()
            or lower(coalesce(s.assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
          )
        )
      )
  )
);

revoke insert, update, delete on public.shipment_import_lines from authenticated;
grant select on public.shipment_import_lines to authenticated;

create or replace function public.persist_import_group_batch(p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  group_item jsonb;
  item jsonb;
  detail_item jsonb;
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
  v_line_key text;
  v_detail_keys text[];
  v_old_detail_count integer;
  v_new_detail_count integer;
begin
  if v_role not in ('employee','team_lead','assistant_manager','manager','admin') then
    raise exception 'Not authorized to import shipments';
  end if;

  for group_item in select value from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    item := coalesce(group_item -> 'shipment', '{}'::jsonb);
    v_code := nullif(trim(coalesce(item ->> 'shipment_code','')), '');
    v_intent := coalesce(item ->> '_relora_import_intent', '');
    v_id := null;
    v_detail_keys := array[]::text[];
    v_old_detail_count := 0;
    v_new_detail_count := 0;

    begin
      v_expected_version := nullif(item ->> '_relora_expected_version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Invalid import review version for shipment %', v_code;
    end;

    if v_code is null then
      raise exception 'Import row is missing shipment_code';
    end if;

    select * into v_before
    from public.shipments
    where shipment_code = v_code
    for update;

    if found then
      v_id := v_before.id;

      if v_before.archived_at is not null then
        if v_intent <> 'restore_update' then
          -- Race-safe default: if a shipment became archived after preview, do not
          -- mutate either its master or detail set. Only an explicit restore may proceed.
          continue;
        end if;
        if v_expected_version is not null and coalesce(v_before.version, 1) <> v_expected_version then
          raise exception 'Shipment % changed after import review. Re-open the import preview before syncing.', v_code;
        end if;
        if not public.v9_can_mutate_shipment(v_id) or v_role = 'portal' then
          raise exception 'Not authorized to restore imported shipment %', v_code;
        end if;

        select count(*) into v_old_detail_count from public.shipment_import_lines where shipment_id = v_id;
        perform public.v9_apply_shipment_patch(v_id, item);
        update public.shipments
        set archived_at = null, archived_by = null, version = version + 1
        where id = v_id
        returning * into v_after;
        v_action := 'import_restore_update';
      else
        if v_intent = 'restore_update' then
          raise exception 'Shipment % changed after import review: it is no longer archived. Re-open the import preview.', v_code;
        end if;
        if v_intent = 'create' then
          raise exception 'Shipment % changed after import review: it now exists. Re-open the import preview.', v_code;
        end if;
        if v_expected_version is not null and coalesce(v_before.version, 1) <> v_expected_version then
          raise exception 'Shipment % changed after import review. Re-open the import preview before syncing.', v_code;
        end if;
        if not public.v9_can_mutate_shipment(v_id) or v_role = 'portal' then
          raise exception 'Not authorized to update imported shipment %', v_code;
        end if;

        select count(*) into v_old_detail_count from public.shipment_import_lines where shipment_id = v_id;
        perform public.v9_apply_shipment_patch(v_id, item);
        update public.shipments set version = version + 1 where id = v_id returning * into v_after;
        v_action := 'import_update';
      end if;
    else
      if v_intent in ('update','restore_update') then
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

    for detail_item in select value from jsonb_array_elements(coalesce(group_item -> 'details', '[]'::jsonb)) loop
      v_line_key := nullif(trim(coalesce(detail_item ->> 'line_key', '')), '');
      if v_line_key is null then
        raise exception 'Import detail is missing line_key for shipment %', v_code;
      end if;
      v_detail_keys := array_append(v_detail_keys, v_line_key);

      insert into public.shipment_import_lines (
        shipment_id, line_key, source_sheet, source_row_number, source_section, raw_cells, normalized_fields
      ) values (
        v_id, v_line_key, nullif(detail_item ->> 'source_sheet', ''),
        case when nullif(detail_item ->> 'source_row_number', '') is null then null else (detail_item ->> 'source_row_number')::integer end,
        nullif(detail_item ->> 'source_section', ''),
        coalesce(detail_item -> 'raw_cells', '[]'::jsonb),
        coalesce(detail_item -> 'normalized_fields', '{}'::jsonb)
      )
      on conflict (shipment_id, line_key) do update set
        source_sheet = excluded.source_sheet,
        source_row_number = excluded.source_row_number,
        source_section = excluded.source_section,
        raw_cells = excluded.raw_cells,
        normalized_fields = excluded.normalized_fields,
        updated_at = now();
    end loop;

    delete from public.shipment_import_lines
    where shipment_id = v_id
      and not (line_key = any(coalesce(v_detail_keys, array[]::text[])));

    select count(*) into v_new_detail_count from public.shipment_import_lines where shipment_id = v_id;

    insert into public.shipment_activity (
      shipment_id, changed_by, action_type, actor_email, actor_name, source, old_value, new_value
    )
    select
      v_id, auth.uid(), v_action, p.email, p.full_name, 'import',
      case when v_action in ('import_update','import_restore_update') then
        jsonb_build_object('shipment_code', v_before.shipment_code, 'shipment_detail_count', v_old_detail_count)::text
      else null end,
      jsonb_build_object('shipment_code', v_after.shipment_code, 'shipment_detail_count', v_new_detail_count, 'previous_detail_count', v_old_detail_count)::text
    from public.profiles p where p.id = auth.uid();

    v_result := v_result || jsonb_build_array(
      jsonb_build_object('shipment', to_jsonb(v_after), 'detail_count', v_new_detail_count, 'previous_detail_count', v_old_detail_count)
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.persist_import_group_batch(jsonb) from public;
grant execute on function public.persist_import_group_batch(jsonb) to authenticated;
