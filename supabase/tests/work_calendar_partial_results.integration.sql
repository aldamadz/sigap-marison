-- Actual owner writes, not a mocked repository. Historic PDF completion
-- events must remain immutable; detail-only edits must not fake a transition.
do $$
declare
    v_owner uuid := '55900000-0000-4000-8000-000000000001';
    v_other uuid := '55900000-0000-4000-8000-000000000002';
    v_id uuid;
    v_row public.work_calendar_entries%rowtype;
    v_at timestamptz;
    v_events integer;
    v_rows integer;
    v_failed boolean;
begin
    insert into public.profiles(id,full_name) values
      (v_owner,'Partial result owner'),(v_other,'Partial result outsider');
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform set_config('role','authenticated',true);

    insert into public.work_calendar_entries(owner_id,work_date,title,status,realization)
    values(v_owner,'2026-10-13','Partial result fixture','planned','  Initial work  ')
    returning * into v_row;
    v_id := v_row.id;
    if v_row.realization is distinct from 'Initial work' or v_row.completed_at is not null then
      raise exception 'Planned insert lost its provisional result';
    end if;

    update public.work_calendar_entries set status='in_progress',realization='  Half done  '
    where id=v_id returning * into v_row;
    if v_row.realization is distinct from 'Half done' or v_row.status<>'in_progress' or v_row.completed_at is not null then
      raise exception 'In-progress update lost result or silently completed task';
    end if;
    select count(*) into v_events from public.work_calendar_events where entry_id=v_id;
    v_at:=v_row.updated_at;
    update public.work_calendar_entries set realization='More progress'
    where id=v_id and updated_at=v_at returning * into v_row;
    if v_row.realization is distinct from 'More progress' or v_row.updated_at<=v_at then
      raise exception 'Detail-only save failed';
    end if;
    if (select count(*) from public.work_calendar_events where entry_id=v_id)<>v_events then
      raise exception 'Detail save fabricated a lifecycle event';
    end if;
    update public.work_calendar_entries set realization='Stale overwrite'
    where id=v_id and updated_at=v_at;
    get diagnostics v_rows=row_count;
    if v_rows<>0 then raise exception 'Stale optimistic update unexpectedly succeeded'; end if;

    update public.work_calendar_entries set status='blocked',blocked_reason='Waiting for input' where id=v_id;
    update public.work_calendar_entries set notes='Still waiting' where id=v_id;
    select * into v_row from public.work_calendar_entries where id=v_id;
    if v_row.realization is distinct from 'More progress' or v_row.status<>'blocked' then
      raise exception 'Blocked/unrelated edits cleared partial result';
    end if;
    update public.work_calendar_entries set status='in_progress' where id=v_id;
    update public.work_calendar_entries set status='completed' where id=v_id returning * into v_row;
    if v_row.realization is distinct from 'More progress' or v_row.completed_at is null or v_row.blocked_reason is not null then
      raise exception 'Completion did not reuse preserved result';
    end if;
    v_at:=v_row.completed_at;
    update public.work_calendar_entries set notes='Final note' where id=v_id returning * into v_row;
    if v_row.completed_at is distinct from v_at then raise exception 'Completion timestamp changed'; end if;

    update public.work_calendar_entries set status='in_progress' where id=v_id returning * into v_row;
    if v_row.realization is distinct from 'More progress' or v_row.completed_at is not null then
      raise exception 'Reopening lost preserved result or retained completion time';
    end if;
    update public.work_calendar_entries set realization='  ' where id=v_id returning * into v_row;
    if v_row.realization is not null then raise exception 'Explicit removal did not normalize to null'; end if;
    v_failed:=false;
    begin
      update public.work_calendar_entries set status='completed' where id=v_id;
    exception when check_violation then v_failed:=true;
    end;
    if not v_failed then raise exception 'Empty completion accepted'; end if;
    v_failed:=false;
    begin
      update public.work_calendar_entries set realization=repeat('x',501) where id=v_id;
    exception when check_violation then v_failed:=true;
    end;
    if not v_failed then raise exception 'Oversized result accepted'; end if;
    if not exists(select 1 from public.work_calendar_events
      where entry_id=v_id and to_status='completed' and detail='More progress') then
      raise exception 'Historical completion result was rewritten';
    end if;

    perform set_config('request.jwt.claim.sub',v_other::text,true);
    update public.work_calendar_entries set realization='Foreign overwrite' where id=v_id;
    get diagnostics v_rows=row_count;
    if v_rows<>0 then raise exception 'Foreign result write accepted'; end if;
    perform set_config('role','anon',true);
    v_failed:=false;
    begin
      update public.work_calendar_entries set realization='Anonymous overwrite' where id=v_id;
    exception when insufficient_privilege then v_failed:=true;
    end;
    if not v_failed then raise exception 'Anonymous write had table access'; end if;
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    v_failed:=false;
    begin
      update public.work_calendar_entries set owner_id=v_other where id=v_id;
    exception when others then v_failed:=true;
    end;
    if not v_failed then raise exception 'Owner identity rewrite accepted'; end if;
    perform public.soft_delete_work_calendar_entry(v_id,(select updated_at from public.work_calendar_entries where id=v_id));
    perform set_config('role','none',true);
    v_failed:=false;
    begin
      update public.work_calendar_entries set realization='Restore deleted task',deleted_at=null where id=v_id;
    exception when raise_exception then v_failed:=true;
    end;
    if not v_failed then raise exception 'Deleted task restore accepted'; end if;
end $$;
select 'CAL-03 partial results integration: all assertions passed';
