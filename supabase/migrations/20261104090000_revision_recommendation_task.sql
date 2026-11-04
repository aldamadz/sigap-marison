-- REC-06: enabling a recommendation during revision must create its canonical task.
begin;

do $patch$
declare v_definition text; v_lock text; v_anchor text;
begin
  v_definition := replace(pg_get_functiondef('public.create_recommendation_task_for_parent(uuid)'::regprocedure), E'\r\n', E'\n');
  if position('-- REC-06 parent row precedes the task advisory lock' in v_definition) = 0 then
    v_lock := '  perform pg_advisory_xact_lock(hashtextextended(p_parent_surat_id::text, 190001));';
    v_anchor := E'  if not found then\n    raise exception ''Surat induk tidak ditemukan.'';\n  end if;';
    if position(v_lock in v_definition) = 0 or position(v_anchor in v_definition) = 0
      or position('recommendation_numbering_internal.reservation_authorizations' in v_definition) = 0 then
      raise exception 'Unknown recommendation factory; audit before applying REC-06.';
    end if;
    -- Revision updates already hold the parent row. Use the same lock order in
    -- direct factory calls to avoid a row/advisory deadlock with those updates.
    v_definition := replace(v_definition, v_lock, '');
    v_definition := replace(v_definition, v_anchor, v_anchor || E'\n\n'
      || '  -- REC-06 parent row precedes the task advisory lock' || E'\n' || v_lock);
    execute v_definition;
  end if;
end $patch$;

do $patch$
declare v_definition text; v_anchor text; v_owner text;
begin
  v_definition := replace(pg_get_functiondef('public.guard_parent_approval_for_recommendation()'::regprocedure), E'\r\n', E'\n');
  if position('-- REC-06 restore the requesting step without approving it' in v_definition) = 0 then
    v_anchor := E'begin\n  if (new.current_step > old.current_step';
    if position(v_anchor in v_definition) = 0 then raise exception 'Unknown recommendation approval guard; audit before REC-06.'; end if;
    select pg_get_userbyid(proowner) into v_owner from pg_proc
      where oid='public.guard_parent_approval_for_recommendation()'::regprocedure;
    if v_owner not in ('postgres','supabase_admin') then raise exception 'Unexpected recommendation guard owner.'; end if;
    execute format('grant usage on schema requester_revision_internal to %I',v_owner);
    execute format('grant select on requester_revision_internal.permits to %I',v_owner);
    v_definition := replace(v_definition,v_anchor,$guard$begin
  -- REC-06 restore the requesting step without approving it. This permit is
  -- private, transaction-bound and issued only by canonical requester submission.
  -- The independent signature guard still requires a completed recommendation.
  if new.current_step > old.current_step and new.status::text='PROSES'
    and new.created_by=auth.uid() and exists(
      select 1 from requester_revision_internal.permits permit
      join public.surat_revision_events event on event.surat_id=permit.surat_id
      where permit.transaction_id=pg_catalog.txid_current() and permit.surat_id=new.id
        and permit.operation='submit' and event.id::text=new.data_snapshot#>>'{applied_revision,event_id}'
        and event.status='resolved' and event.target_type='requester'
        and event.changes->>'requester_edit_required'='true'
        and event.changes->>'resume_step'=new.current_step::text
    ) then return new; end if;
  if (new.current_step > old.current_step$guard$);
    execute v_definition;
  end if;
end $patch$;

create or replace function public.create_missing_revision_recommendation_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.form_input_data->>'requires_recommendation', 'false')) <> 'true'
    or exists(select 1 from public.surat_recommendation_tasks task
      where task.parent_surat_id=new.id and task.status<>'cancelled') then
    return new;
  end if;
  -- Background writes must not impersonate a requester. The factory retains
  -- ownership, eligibility, numbering and internal office-capability checks.
  if not exists(select 1 from public.profiles actor where actor.id=auth.uid()
    and actor.is_active is true and actor.deleted_at is null
    and (new.created_by=actor.id or new.represented_by_admin=actor.id or actor.role::text='admin')) then
    return new;
  end if;
  perform public.create_recommendation_task_for_parent(new.id);
  return new;
end $$;

revoke all on function public.create_missing_revision_recommendation_task() from public,anon,authenticated,service_role;
drop trigger if exists create_missing_revision_recommendation_task on public.surat_registrasi;
create trigger create_missing_revision_recommendation_task
  after update of form_input_data on public.surat_registrasi
  for each row execute function public.create_missing_revision_recommendation_task();

notify pgrst, 'reload schema';
commit;
