begin;

-- Task-bound recommendations reopen an existing document number. A client
-- recommendation label alone does not authorize the exception.
create or replace function registration_draft_lifecycle_internal.is_recommendation_task_draft(
  p_reservation_id uuid, p_created_by uuid, p_no_surat text, p_payload jsonb
)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_payload #>> '{linkedDocumentContext,type}' = 'recommendation' then
    exists(select 1 from public.surat_recommendation_tasks t
      join public.surat_reservations r on r.id = t.reservation_id
      where t.id::text = p_payload #>> '{linkedDocumentContext,taskId}'
        and t.parent_surat_id::text = p_payload #>> '{linkedDocumentContext,parentSuratId}'
        and t.reservation_id = p_reservation_id and t.no_surat = p_no_surat
        and t.status = 'claimed' and t.claimed_by = p_created_by
        and r.reserved_by = p_created_by and r.status in ('PENDING','USED')
        and public.is_recommendation_task_candidate(t.id,p_created_by))
    else false end;
$$;
revoke all on function registration_draft_lifecycle_internal.is_recommendation_task_draft(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;

do $patch$
declare
  v_name text;
  v_source text;
  v_anchor text := 'if new.revision_event_id is not null or new.status <> ''DRAFT'' then return new; end if;';
  v_guard text := 'if registration_draft_lifecycle_internal.is_recommendation_task_draft(new.reservation_id,new.created_by,new.no_surat,new.payload) then return new; end if;';
begin
  foreach v_name in array array['guard_draft','renew_reservation'] loop
    v_source := pg_get_functiondef(('registration_draft_lifecycle_internal.'||v_name||'()')::regprocedure);
    if strpos(v_source,v_guard)=0 then
      if strpos(v_source,v_anchor)=0 then raise exception 'Unknown draft lifecycle implementation: %',v_name; end if;
      execute replace(v_source,v_anchor,v_anchor||E'\n  '||v_guard);
    end if;
  end loop;
end $patch$;

notify pgrst, 'reload schema';
commit;
