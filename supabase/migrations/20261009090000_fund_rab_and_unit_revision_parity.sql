begin;

-- Only the backend may attest a fresh vendor GET. Browser RPC callers must
-- consume this short-lived, request-bound receipt in the same transaction.
create table if not exists public.unit_revision_availability_receipts (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  revision_event_id uuid not null references public.surat_revision_events(id),
  draft_id uuid not null references public.surat_registration_drafts(id),
  project_id bigint not null check(project_id>0),
  project_code text not null check(nullif(btrim(project_code),'') is not null),
  requested_count integer not null check(requested_count>0),
  available_count integer not null check(available_count>=requested_count),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '2 minutes'),
  consumed_at timestamptz,
  unique(revision_event_id,draft_id,actor_id)
);
alter table public.unit_revision_availability_receipts enable row level security;
revoke all on public.unit_revision_availability_receipts from public,anon,authenticated,service_role;
grant select,insert,update on public.unit_revision_availability_receipts to service_role;

-- Classify persisted PGD Fund stages; RAB is optional regardless of legacy flags.
create or replace function public.fund_rab_stage(p_sig_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when ss.label_jabatan ilike '%perencanaan%' then 'planning'
    when ss.label_jabatan ilike '%hrd%' or ss.label_jabatan ilike '%sdm%'
      or ss.label_jabatan ilike '%sumber daya manusia%' then 'hrd'
    else null end
  from public.surat_signatures ss join public.surat_registrasi sr on sr.id=ss.surat_id
  left join public.form_usages u on u.id=sr.form_usage_id
  left join public.master_forms f on f.id=u.form_id
  where ss.id=p_sig_id and ss.role_name='memeriksa'
    and coalesce(sr.form_input_data->>'request_category',sr.form_input_data->>'request_mode')='non_asset'
    and upper(trim(coalesce(sr.location_snapshot#>>'{form,nomor_form}',
      sr.data_snapshot#>>'{form,nomor_form}',f.nomor_form,''))) ~ '(^|[.-])PGD([.-]|$)'
$$;

create or replace function public.is_fund_planning_signature(p_sig_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.fund_rab_stage(p_sig_id)='planning',false)
$$;

create or replace function public.effective_fund_rab_requirements(p_sig_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_sig public.surat_signatures%rowtype; v_rules jsonb;
begin
  select * into v_sig from public.surat_signatures where id=p_sig_id;
  v_rules:=coalesce(v_sig.attachment_requirements_snapshot,'[]'::jsonb);
  if public.fund_rab_stage(p_sig_id) is null then return v_rules; end if;
  if not exists(select 1 from jsonb_array_elements(v_rules) r where r->>'requirement_key'='rab') then
    v_rules:=v_rules || '[{"requirement_key":"rab","label":"RAB hasil pemeriksaan","max_files":1,"allow_multiple":false,"allowed_types":["application/pdf"],"max_size_bytes":10485760}]'::jsonb;
  end if;
  select coalesce(jsonb_agg(case when r->>'requirement_key'='rab' then
    r || jsonb_build_object('is_required',false,'min_files',0)
    else r end order by n),'[]'::jsonb) into v_rules
  from jsonb_array_elements(v_rules) with ordinality t(r,n);
  return v_rules;
end $$;

revoke all on function public.fund_rab_stage(uuid),public.is_fund_planning_signature(uuid),
  public.effective_fund_rab_requirements(uuid)
  from public,anon,authenticated,service_role;

-- Patch the shared canonical core. Do not rename or recreate the requester,
-- checklist, or staging-only RAB wrappers around it.
do $patch$
declare v_source text; v_old text:='coalesce(v_signature.attachment_requirements_snapshot, ''[]''::jsonb)';
  v_new text:='public.effective_fund_rab_requirements(v_signature.id)';
  v_anchor text:='  v_snapshot := coalesce(v_surat.data_snapshot, ''{}''::jsonb);';
begin
  select replace(pg_get_functiondef('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)'::regprocedure),E'\r\n',E'\n') into v_source;
  if position(v_new in v_source)=0 then
    if (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1 then
      raise exception 'Canonical Fund attachment source drift: audit before applying'; end if;
    v_source:=replace(v_source,v_old,v_new);
  end if;
  if (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor)<>1
    or position('v_actor = any(target_user_ids)' in v_source)=0
    or position('v_signature.verification_required is not true' in v_source)=0 then
    raise exception 'Canonical Fund verifier lifecycle drift: audit before applying'; end if;
  execute v_source;

  select pg_get_functiondef('public.verify_surat_signature(uuid,text)'::regprocedure) into v_source;
  if position('public.fund_rab_stage(p_sig_id) is not null' in v_source)=0 then
    v_old:='if exists(select 1 from public.surat_signatures';
    if position(v_old in v_source)>0 and position('public.is_fund_planning_signature(p_sig_id)' in v_source)=0 then
      v_source:=replace(v_source,v_old,'if public.fund_rab_stage(p_sig_id) is not null or exists(select 1 from public.surat_signatures');
    elsif position('if public.is_fund_planning_signature(p_sig_id) or exists(' in v_source)>0 then
      v_source:=replace(v_source,'if public.is_fund_planning_signature(p_sig_id) or exists(',
        'if public.fund_rab_stage(p_sig_id) is not null or exists(');
    else raise exception 'Legacy Fund verifier routing drift: audit before applying'; end if;
    execute v_source;
  end if;
end $patch$;

-- Only the delegated external pre-requester core changes. Its non-Unit branch,
-- recommendation routing, acceptance lifecycle, and public requester wrapper stay intact.
do $patch$
declare v_source text; v_start integer; v_end integer; v_old text; v_anchor text; v_core regprocedure;
  v_unit text:=$unit$  if v_category = 'unit' then
    -- SIGAP Unit external project parity v1.
    if v_surat.created_by is distinct from v_actor or v_draft.created_by is distinct from v_actor
      or not exists(select 1 from public.profiles where id=v_actor and is_active is true and deleted_at is null) then
      raise exception 'Draft perbaikan bukan milik pemohon aktif.' using errcode='42501'; end if;
    if v_event.status is distinct from 'open' or v_event.target_type is distinct from 'requester'
      or v_event.changes->'external_submission_revision' is distinct from 'true'::jsonb
      or v_surat.status is distinct from 'MENUNGGU_PERBAIKAN' or v_draft.status is distinct from 'DRAFT'
      or v_draft.revision_event_id is distinct from v_event.id or v_draft.expires_at is null
      or v_draft.expires_at<=clock_timestamp()
      or v_surat.data_snapshot#>>'{revision,event_id}' is distinct from v_event.id::text
      or v_draft.payload#>>'{externalRevision,eventId}' is distinct from v_event.id::text
      or v_draft.payload#>'{externalRevision,generation}' is distinct from v_event.changes->'revision_generation'
      or v_draft.no_surat is distinct from v_surat.no_surat then
      raise exception 'Draft atau revisi tidak lagi aktif.' using errcode='40001'; end if;
    if jsonb_typeof(v_input) is distinct from 'object'
      or coalesce(v_input->>'requested_unit_count','') !~ '^[0-9]{1,9}$'
      or (v_input->>'requested_unit_count')::integer<1 then
      raise exception 'Jumlah unit perbaikan wajib minimal 1.' using errcode='22023'; end if;
    v_requested_count:=(v_input->>'requested_unit_count')::integer;
    if jsonb_typeof(v_input->'requested_project') is distinct from 'object'
      or coalesce(v_input#>>'{requested_project,id}','') !~ '^[0-9]{1,18}$'
      or (v_input#>>'{requested_project,id}')::bigint<1
      or nullif(btrim(v_input#>>'{requested_project,code}'),'') is null then
      raise exception 'Proyek unit perbaikan belum terhubung ke Marison.' using errcode='22023'; end if;
    if not exists(select 1 from public.master_projects project
      join public.master_offices office on office.id=project.office_id
      where project.marison_project_id=(v_input#>>'{requested_project,id}')::bigint
        and project.code=v_input#>>'{requested_project,code}' and project.marison_synced_at is not null
        and office.marison_branch_id>0 and office.marison_synced_at is not null
        and not ('Branch proyek external belum tersedia'=any(coalesce(project.marison_review_reasons,'{}'::text[])))) then
      raise exception 'Proyek unit perbaikan atau kantor external belum tersedia.' using errcode='22023'; end if;
    if exists(select 1 from public.surat_registration_draft_files file where draft_id=v_draft.id
      and (created_by is distinct from v_actor or exists(select 1 from public.surat_attachments a
        where a.surat_id=v_surat.id and a.file_url=file.file_url and (a.stage is distinct from 'initial' or a.signature_id is not null)))) then
      raise exception 'Lampiran pemeriksa tidak dapat menjadi lampiran pemohon.' using errcode='42501'; end if;
    if nullif(p_form_data->>'penggunaan_id','') is distinct from v_surat.penggunaan_id::text
      or (p_form_data ? 'no_surat' and p_form_data->>'no_surat' is distinct from v_surat.no_surat) then
      raise exception 'Identitas dan nomor dokumen tidak boleh diubah pada revisi.' using errcode='22023'; end if;
    if coalesce(p_form_data->>'unit_availability_receipt_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Validasi kapasitas unit terbaru wajib dilakukan melalui backend.' using errcode='22023'; end if;
    update public.unit_revision_availability_receipts set consumed_at=clock_timestamp()
      where id=(p_form_data->>'unit_availability_receipt_id')::uuid and actor_id=v_actor
        and revision_event_id=v_event.id and draft_id=v_draft.id
        and project_id=(v_input#>>'{requested_project,id}')::bigint
        and project_code=v_input#>>'{requested_project,code}' and requested_count=v_requested_count
        and available_count>=v_requested_count and expires_at>clock_timestamp() and consumed_at is null;
    if not found then
      raise exception 'Bukti kapasitas unit tidak tersedia, kedaluwarsa, atau tidak cocok dengan revisi.' using errcode='42501'; end if;
    if v_input->'requested_project' is distinct from v_surat.form_input_data->'requested_project' then
      -- Erase all allocation outputs and draft sources; no old project can be reselected by fallback.
      v_surat.form_input_data:=v_surat.form_input_data-'allocated_project'-'allocated_units'-'allocated_unit_count'
        -'allocated_by_signature_id'-'allocated_at'-'unit_config_snapshot';
      update public.surat_registrasi set data_snapshot=data_snapshot-'allocated_project'-'allocated_units'
        -'allocated_unit_count'-'verification_inputs'-'verification_drafts'-'unit_config_snapshot' where id=v_surat.id;
    end if;
    v_input:=coalesce(v_surat.form_input_data,'{}'::jsonb)||jsonb_build_object(
      'requested_project',v_input->'requested_project','requested_unit_count',v_requested_count,
      'requester_revision_note',nullif(btrim(coalesce(p_requester_note,'')),''));
  end if;$unit$;
begin
  if to_regprocedure('public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text)') is null
    or position('requester_revision_internal.finish' in pg_get_functiondef(
      'public.submit_external_submission_revision(uuid,uuid,jsonb,text)'::regprocedure))=0 then
    raise exception 'Requester revision wrapper missing or drifted: audit before applying'; end if;
  v_core:='public.submit_external_submission_revision_pre_requester_edit(uuid,uuid,jsonb,text)'::regprocedure;
  if position('public.submit_external_submission_revision_pre_keu10(' in pg_get_functiondef(v_core))>0 then
    if position('if not public.is_keu10_surat(v_event.surat_id)' in pg_get_functiondef(v_core))=0
      or to_regprocedure('public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text)') is null then
      raise exception 'KEU10 external revision delegation drift: audit before applying'; end if;
    v_core:='public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text)'::regprocedure;
  end if;
  select replace(pg_get_functiondef(v_core),E'\r\n',E'\n') into v_source;
  v_start:=position('  if v_category = ''unit'' then' in v_source);
  if v_start=0 then raise exception 'External Unit revision block missing'; end if;
  v_end:=strpos(substr(v_source,v_start),E'\n\n  update public.surat_registrasi');
  if v_end=0 then raise exception 'External Unit revision boundary drift'; end if;
  v_old:=substr(v_source,v_start,v_end-1);
  if position('SIGAP Unit external project parity v1' in v_source)>0 then
    if v_old is distinct from v_unit then
      raise exception 'Installed external Unit revision source drift: audit before applying'; end if;
  else
    -- Known production/staging unit blocks only; fail closed on an unaudited third shape.
    if md5(v_old) not in ('cc19df587b04ab0b48d5f838e170c63f','55ad767edaf8b0b680209127cadd36f5') then
      raise exception 'External Unit revision source drift: audit before applying'; end if;
    v_source:=overlay(v_source placing v_unit from v_start for length(v_old));
    v_anchor:='    and attachment.stage = ''initial''';
    if (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor)<>1 then
      raise exception 'External Unit attachment deletion drift'; end if;
    v_source:=replace(v_source,v_anchor,v_anchor||E'\n    and attachment.signature_id is null');
    execute v_source;
  end if;
end $patch$;

notify pgrst,'reload schema';
commit;
