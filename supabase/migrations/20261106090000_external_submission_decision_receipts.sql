begin;

create table if not exists public.external_submission_decision_receipts (
  id uuid primary key default gen_random_uuid(),
  decision_event_id uuid not null unique references public.external_submission_decision_events(id) on delete restrict,
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  dispatch_id uuid not null references public.marison_outbound_dispatches(id) on delete restrict,
  environment text not null check(environment in ('staging','production')),
  document_number text not null,
  dispatch_generation integer not null check(dispatch_generation > 0),
  dispatch_status text not null check(dispatch_status in ('failed_terminal','outcome_unknown')),
  dispatch_payload_hash text not null check(dispatch_payload_hash ~ '^[0-9a-f]{64}$'),
  source text not null default 'authenticated_external_decision'
    check(source = 'authenticated_external_decision'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists external_submission_decision_receipts_surat_idx
  on public.external_submission_decision_receipts(surat_id, created_at desc);
alter table public.external_submission_decision_receipts enable row level security;
revoke all on public.external_submission_decision_receipts from public, anon, authenticated, service_role;
grant select on public.external_submission_decision_receipts to service_role;

create or replace function public.guard_external_decision_receipt_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Bukti keputusan external tidak dapat diubah atau dihapus.' using errcode = '55000';
end $$;
revoke all on function public.guard_external_decision_receipt_history() from public, anon, authenticated, service_role;
drop trigger if exists immutable_external_decision_receipt on public.external_submission_decision_receipts;
create trigger immutable_external_decision_receipt before update or delete on public.external_submission_decision_receipts
  for each row execute function public.guard_external_decision_receipt_history();

-- Only the authenticated decision RPC calls this fallback. Unit's vendor-ID
-- revision contract and other delivery/recovery paths are deliberately unchanged.
create or replace function public.resolve_external_decision_dispatch(
  p_surat_id uuid, p_environment text, p_document_number text, p_decided_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_dispatch public.marison_outbound_dispatches%rowtype;
  v_surat public.surat_registrasi%rowtype;
begin
  if p_environment not in ('staging','production') or p_decided_at is null
     or p_decided_at > clock_timestamp() + interval '5 minutes' then return null; end if;
  select * into v_surat from public.surat_registrasi where id = p_surat_id;
  if not found or btrim(v_surat.no_surat) is distinct from p_document_number
     or v_surat.updated_at is null
     or upper(coalesce(v_surat.status::text,'')) not in ('DONE','SELESAI')
     or public.marison_procurement_routing_block(p_surat_id) is not null then return null; end if;

  -- Lock the newest generation, never an older convenient failed attempt.
  select * into v_dispatch from public.marison_outbound_dispatches
  where surat_id = p_surat_id and environment = p_environment
  order by generation desc limit 1 for update;
  if not found or v_dispatch.kind <> 'fund' or v_dispatch.endpoint <> '/fund-submissions'
     or v_dispatch.status::text not in ('failed_terminal','outcome_unknown')
     or v_dispatch.post_started_at is null or v_dispatch.payload_built_at is null
     or v_dispatch.payload is null or v_dispatch.payload_body is null
     or v_dispatch.payload_hash is null
     or v_dispatch.payload_hash !~ '^[0-9a-f]{64}$'
     or v_dispatch.payload->>'submission_number' is distinct from p_document_number
     or v_dispatch.payload_built_at < v_surat.updated_at
     or p_decided_at < v_dispatch.post_started_at
     or encode(extensions.digest(convert_to(v_dispatch.payload_body,'UTF8'),'sha256'),'hex') is distinct from v_dispatch.payload_hash
     then return null; end if;
  begin
    if v_dispatch.payload_body::jsonb is distinct from v_dispatch.payload then return null; end if;
  exception when invalid_text_representation then return null;
  end;
  if not exists(select 1 from public.surat_signatures where surat_id = p_surat_id)
     or exists(select 1 from public.surat_signatures where surat_id = p_surat_id
       and (is_signed is distinct from true or signed_at is null or signed_at > v_dispatch.payload_built_at))
     then return null; end if;
  return v_dispatch.id;
end $$;
revoke all on function public.resolve_external_decision_dispatch(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_external_decision_dispatch(uuid,text,text,timestamptz) to service_role;

-- Patch the preserved business implementation, retaining its locks, idempotency,
-- linked-document validation, rejection and configurable revision wrappers.
do $patch$
declare
  v_function regprocedure := coalesce(
    to_regprocedure('public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)'),
    to_regprocedure('public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)'));
  v_body text;
  v_owner text;
  v_declare text := E'  v_related_users uuid[] := ''{}'';';
  v_guard text := E'    raise exception ''Dokumen belum terbukti berhasil dikirim ke sistem departemen.'' using errcode = ''22023'';';
  v_insert text := '  ) returning * into v_decision_event;';
begin
  if v_function is null then raise exception 'External decision implementation is missing'; end if;
  select pg_get_userbyid(proowner) into v_owner from pg_proc where oid = v_function;
  -- Match only this new table to the canonical writer, including self-hosted
  -- installations where the migration operator and function owner differ.
  execute format('alter table public.external_submission_decision_receipts owner to %I',v_owner);
  execute format('grant execute on function public.resolve_external_decision_dispatch(uuid,text,text,timestamptz) to %I',v_owner);
  v_body := replace(pg_get_functiondef(v_function),E'\r\n',E'\n');
  if strpos(v_body,'resolve_external_decision_dispatch') > 0 then
    if strpos(v_body,'insert into public.external_submission_decision_receipts') = 0 then
      raise exception 'Incomplete external decision receipt implementation';
    end if;
  else
    if (length(v_body)-length(replace(v_body,v_declare,'')))/length(v_declare) <> 1
       or (length(v_body)-length(replace(v_body,v_guard,'')))/length(v_guard) <> 1
       or (length(v_body)-length(replace(v_body,v_insert,'')))/length(v_insert) <> 1 then
      raise exception 'Unknown external decision implementation; audit before applying';
    end if;
    v_body := replace(v_body,v_declare,v_declare || E'\n  v_callback_dispatch_id uuid;');
    v_body := replace(v_body,v_guard,$guard$
    v_callback_dispatch_id := public.resolve_external_decision_dispatch(v_surat.id,p_environment,v_document_number,p_decided_at);
    if v_callback_dispatch_id is null then
      raise exception 'Dokumen belum terbukti berhasil dikirim ke sistem departemen.' using errcode = '22023';
    end if;
$guard$);
    v_body := replace(v_body,v_insert,v_insert || $receipt$
  if v_callback_dispatch_id is not null then
    insert into public.external_submission_decision_receipts(
      decision_event_id,surat_id,dispatch_id,environment,document_number,
      dispatch_generation,dispatch_status,dispatch_payload_hash
    ) select v_decision_event.id,v_surat.id,dispatch.id,p_environment,v_document_number,
      dispatch.generation,dispatch.status::text,dispatch.payload_hash
      from public.marison_outbound_dispatches dispatch where dispatch.id = v_callback_dispatch_id;
  end if;
$receipt$);
    execute v_body;
  end if;
end $patch$;

notify pgrst, 'reload schema';
commit;
