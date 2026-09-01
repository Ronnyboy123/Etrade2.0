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
