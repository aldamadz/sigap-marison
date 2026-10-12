begin;

create or replace function requester_revision_internal.can_read_recommendation_revision_parent(p_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.surat_recommendation_tasks task
    join public.surat_registrasi child on child.id=task.submitted_surat_id
    join public.profiles owner on owner.id=child.created_by
    join public.surat_linked_documents link on link.child_surat_id=child.id and link.parent_surat_id=task.parent_surat_id
      and link.link_type='recommendation' and link.status='active'
    join public.surat_revision_events event on event.surat_id=child.id
    join public.surat_registration_drafts draft on draft.revision_event_id=event.id
    where task.id=p_task and child.created_by=auth.uid() and owner.is_active is true and owner.deleted_at is null
      and child.status='MENUNGGU_PERBAIKAN' and child.form_input_data->>'linked_document_type'='recommendation'
      and child.data_snapshot#>>'{revision,event_id}'=event.id::text and event.status='open' and event.target_type='requester'
      and event.changes @> '{"requester_edit_required":true}'::jsonb and draft.created_by=auth.uid()
      and draft.status='DRAFT' and draft.expires_at>clock_timestamp())
$$;
revoke all on function requester_revision_internal.can_read_recommendation_revision_parent(uuid) from public,anon,authenticated,service_role;

do $patch$
declare v_source text; v_old text:=$old$and task.status in ('waiting', 'claimed')
    and (
      task.claimed_by = v_actor
      or public.is_recommendation_task_candidate(task.id, v_actor)
    )$old$;
begin
  select pg_get_functiondef('public.get_recommendation_parent_summary(uuid)'::regprocedure) into v_source;
  if position('can_read_recommendation_revision_parent' in v_source)=0 then
    if position(v_old in v_source)=0 then raise exception 'Recommendation parent summary source drift'; end if;
    execute replace(v_source,v_old,'and (requester_revision_internal.can_read_recommendation_revision_parent(task.id) or ('||substr(v_old,5)||'))');
  end if;
end $patch$;
notify pgrst,'reload schema';
commit;
