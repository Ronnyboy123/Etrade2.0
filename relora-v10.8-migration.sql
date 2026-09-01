-- Relora v10.8
-- Prevent stale archived rows from aborting imports while preserving explicit Restore & Update.
-- Safe to run after v10.5; functions are replaced in place.

-- Relora v10.5
-- Customs Declarants may archive/restore only shipments assigned to them.
-- Permanent deletion remains Admin-only.

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
  if v_role not in ('employee','team_lead','manager','admin') then
    raise exception 'Not authorized to archive shipments';
  end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    select * into v_row from public.shipments where id = v_id for update;
    if not found then continue; end if;

    if v_role = 'team_lead' and v_row.team_id is distinct from public.current_user_team_id() then
      raise exception 'Not authorized to archive a shipment outside your team';
    end if;

    if v_role = 'employee' and not (
      v_row.assigned_user_id = auth.uid()
      or lower(coalesce(v_row.assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    ) then
      raise exception 'Not authorized to archive a shipment not assigned to you';
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
  if v_role not in ('employee','team_lead','manager','admin') then
    raise exception 'Not authorized to restore shipments';
  end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    select * into v_row from public.shipments where id = v_id for update;
    if not found then continue; end if;

    if v_role = 'team_lead' and v_row.team_id is distinct from public.current_user_team_id() then
      raise exception 'Not authorized to restore a shipment outside your team';
    end if;

    if v_role = 'employee' and not (
      v_row.assigned_user_id = auth.uid()
      or lower(coalesce(v_row.assigned_to,'')) = lower(coalesce(public.current_user_declarant_name(),''))
    ) then
      raise exception 'Not authorized to restore a shipment not assigned to you';
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

revoke all on function public.archive_shipments(uuid[]) from public;
revoke all on function public.restore_shipments(uuid[]) from public;
grant execute on function public.archive_shipments(uuid[]) to authenticated;
grant execute on function public.restore_shipments(uuid[]) to authenticated;


-- Archived imports can now be explicitly restored and updated in one atomic transaction.
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

      if v_before.archived_at is not null then
        if v_intent <> 'restore_update' then
          -- Safe default: an archived duplicate should not abort the rest of the import.
          -- Only an explicit Restore & Update decision may reactivate it.
          continue;
        end if;
        if v_expected_version is not null and coalesce(v_before.version, 1) <> v_expected_version then
          raise exception 'Shipment % changed after import review. Re-open the import preview before syncing.', v_code;
        end if;
        if not public.v9_can_mutate_shipment(v_id) or v_role = 'portal' then
          raise exception 'Not authorized to restore imported shipment %', v_code;
        end if;

        perform public.v9_apply_shipment_patch(v_id, item);
        update public.shipments
        set archived_at = null,
            archived_by = null,
            version = version + 1
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

    insert into public.shipment_activity (
      shipment_id, changed_by, action_type, actor_email, actor_name, source, old_value, new_value
    )
    select
      v_id, auth.uid(), v_action, p.email, p.full_name, 'import',
      case when v_action in ('import_update','import_restore_update') then v_before.shipment_code else null end,
      v_after.shipment_code
    from public.profiles p where p.id = auth.uid();

    v_result := v_result || jsonb_build_array(to_jsonb(v_after));
  end loop;

  return v_result;
end;
$$;


revoke all on function public.persist_import_batch(jsonb) from public;
grant execute on function public.persist_import_batch(jsonb) to authenticated;
