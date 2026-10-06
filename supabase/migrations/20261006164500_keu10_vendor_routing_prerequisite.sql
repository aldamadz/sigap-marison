begin;

-- Selective releases may retain the original vendor RPC without the historical
-- routing wrapper. Preserve that implementation behind the same private name;
-- KEU10 supplies its own requester/restart policy in the following migration.
do $prerequisite$
declare
  v_legacy regprocedure := to_regprocedure('public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)');
  v_current regprocedure := to_regprocedure('public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)');
  v_body text;
begin
  if v_legacy is not null then return; end if;
  if v_current is null or to_regprocedure('public.apply_external_submission_decision_pre_keu10(uuid,text,text,text,timestamptz,text,text)') is not null then
    raise exception 'KEU10 vendor prerequisite requires the original vendor RPC';
  end if;
  v_body := replace(pg_get_functiondef(v_current),E'\r\n',E'\n');
  if strpos(v_body,E'select coalesce(max(event.revision_generation), 0) + 1 into v_generation\n  from public.external_submission_decision_events event\n  where event.surat_id = v_surat.id and event.decision = ''revision_required'';')=0
     or strpos(v_body,'insert into public.surat_external_revision_history(')=0
     or strpos(v_body,'Dokumen belum terbukti berhasil dikirim ke sistem departemen.')=0 then
    raise exception 'Unknown vendor decision implementation; audit before applying KEU10';
  end if;
  alter function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)
    rename to apply_external_submission_decision_pre_configurable_routing;
  execute $wrapper$
    create function public.apply_external_submission_decision(p_event_id uuid,p_document_number text,p_decision text,
      p_reason text,p_decided_at timestamptz,p_payload_hash text,p_environment text)
    returns jsonb language sql security definer set search_path='' as $body$
      select public.apply_external_submission_decision_pre_configurable_routing(
        p_event_id,p_document_number,p_decision,p_reason,p_decided_at,p_payload_hash,p_environment);
    $body$;
  $wrapper$;
  revoke all on function public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)
    from public,anon,authenticated,service_role;
  revoke all on function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)
    from public,anon,authenticated;
  grant execute on function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text) to service_role;
end;
$prerequisite$;

notify pgrst,'reload schema';
commit;
