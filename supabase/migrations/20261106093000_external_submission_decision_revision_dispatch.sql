begin;

create index if not exists external_submission_decision_receipts_dispatch_idx
  on public.external_submission_decision_receipts(dispatch_id);

create or replace function public.receipt_allows_external_fund_revision(p_surat_id uuid,p_dispatch_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.external_submission_decision_receipts receipt
    join public.marison_outbound_dispatches dispatch on dispatch.id=receipt.dispatch_id
    join public.external_submission_decision_events decision on decision.id=receipt.decision_event_id
    join public.surat_registrasi surat on surat.id=receipt.surat_id
    join public.surat_revision_events revision on revision.surat_id=surat.id
      and revision.id::text=surat.data_snapshot#>>'{external_revision_current,revision_event_id}'
      and revision.changes->>'external_decision_event_id'=decision.id::text
    join public.surat_external_revision_history history on history.surat_id=surat.id
      and history.decision_event_id=decision.id
      and history.generation::text=surat.data_snapshot#>>'{external_revision_current,generation}'
    where receipt.surat_id=p_surat_id and receipt.dispatch_id=p_dispatch_id
      and dispatch.surat_id=surat.id and dispatch.environment=receipt.environment
      and dispatch.kind='fund' and dispatch.endpoint='/fund-submissions'
      and dispatch.payload_hash=receipt.dispatch_payload_hash
      and dispatch.generation=receipt.dispatch_generation
      and decision.surat_id=surat.id and decision.decision='revision_required'
      and revision.status='resolved' and revision.resolved_at is not null
      and revision.changes->'external_submission_revision'='true'::jsonb
      and revision.changes->>'revision_generation'=history.generation::text
      and upper(surat.status::text) in ('DONE','SELESAI')
      and public.marison_procurement_routing_block(surat.id) is null
      and exists(select 1 from public.surat_signatures where surat_id=surat.id)
      and not exists(select 1 from public.surat_signatures where surat_id=surat.id
        and (is_signed is distinct from true or signed_at is null))
      and not exists(select 1 from public.marison_outbound_dispatches newer
        where newer.surat_id=dispatch.surat_id and newer.environment=dispatch.environment and newer.generation>dispatch.generation)
  );
$$;
revoke all on function public.receipt_allows_external_fund_revision(uuid,uuid) from public,anon,authenticated;
grant execute on function public.receipt_allows_external_fund_revision(uuid,uuid) to service_role;

-- A real returned revision may create a fresh generation only after correction
-- and approval. A receipt never authorizes retrying the original submission.
create or replace function public.guard_receipted_fund_dispatch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_parent public.marison_outbound_dispatches%rowtype;
begin
  if tg_op='UPDATE' then
    if exists(select 1 from public.external_submission_decision_receipts where dispatch_id=old.id)
       and (new.status::text in ('pending','processing','failed_retryable')
         or new.payload is distinct from old.payload or new.payload_body is distinct from old.payload_body
         or new.payload_hash is distinct from old.payload_hash or new.post_started_at is distinct from old.post_started_at) then
      raise exception 'External telah mengonfirmasi penerimaan; pengiriman lama tidak boleh diulang.' using errcode='55000';
    end if;
    if (new.replacement_of_dispatch_id is distinct from old.replacement_of_dispatch_id
        or new.surat_id<>old.surat_id or new.environment<>old.environment or new.generation<>old.generation
        or new.kind<>old.kind or new.endpoint<>old.endpoint)
       and exists(select 1 from public.external_submission_decision_receipts
         where dispatch_id in (old.replacement_of_dispatch_id,new.replacement_of_dispatch_id,old.id)) then
      raise exception 'Identitas pengiriman yang terikat bukti external tidak boleh diubah.' using errcode='55000';
    end if;
  elsif new.replacement_of_dispatch_id is not null
      and exists(select 1 from public.external_submission_decision_receipts where dispatch_id=new.replacement_of_dispatch_id) then
    select * into v_parent from public.marison_outbound_dispatches where id=new.replacement_of_dispatch_id for update;
    if new.surat_id is distinct from v_parent.surat_id or new.environment is distinct from v_parent.environment
       or new.kind is distinct from 'fund' or new.endpoint is distinct from '/fund-submissions'
       or new.generation is distinct from v_parent.generation+1
       or not public.receipt_allows_external_fund_revision(new.surat_id,v_parent.id) then
      raise exception 'Pengiriman baru memerlukan revisi external yang telah diperbaiki dan disetujui.' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_receipted_fund_dispatch() from public,anon,authenticated,service_role;
drop trigger if exists guard_receipted_fund_dispatch on public.marison_outbound_dispatches;
create trigger guard_receipted_fund_dispatch before insert or update on public.marison_outbound_dispatches
  for each row execute function public.guard_receipted_fund_dispatch();

do $patch$
declare
  v_function regprocedure := 'public.enqueue_external_revision_dispatch()'::regprocedure;
  v_body text := replace(pg_get_functiondef(v_function),E'\r\n',E'\n');
  v_anchor text := '  where dispatch.surat_id = new.id and dispatch.status = ''succeeded''';
  v_owner text;
begin
  select pg_get_userbyid(proowner) into v_owner from pg_proc where oid=v_function;
  execute format('grant execute on function public.receipt_allows_external_fund_revision(uuid,uuid) to %I',v_owner);
  if strpos(v_body,'receipt_allows_external_fund_revision')=0 then
    if (length(v_body)-length(replace(v_body,v_anchor,'')))/length(v_anchor)<>1 then
      raise exception 'Unknown external revision enqueue implementation; audit before applying';
    end if;
    execute replace(v_body,v_anchor,
      '  where dispatch.surat_id = new.id and (dispatch.status = ''succeeded'' or public.receipt_allows_external_fund_revision(new.id,dispatch.id))');
  end if;
end $patch$;

notify pgrst, 'reload schema';
commit;
