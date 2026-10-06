-- Actual canonical RPCs, with authenticated callers and no job_title_display column.
create function keu10_test.payload(p_n integer,p_group integer,p_amount bigint,p_type text default 'marketing_cost')
returns jsonb language plpgsql as $$
declare v_reservation uuid := keu10_test.id(1000+p_n); v_draft uuid := keu10_test.id(2000+p_n);
  v_usage uuid := ('6e102000-0000-4000-8000-'||lpad(p_group::text,12,'0'))::uuid;
  v_no text := lpad(p_n::text,3,'0')||'/TEST/KEU10/X/2026'; v_purpose text;
begin
  select keu10_config#>>'{purposes,0,code}' into v_purpose from public.form_usages where id=v_usage;
  insert into public.surat_reservations(id,entity_id,type_id,office_id,project_id,dept_id,year,no_urut,reserved_by,status,number_scope_type)
    values(v_reservation,keu10_test.id(401),keu10_test.id(501),keu10_test.id(202),keu10_test.id(301),
      keu10_test.id(105),2026,p_n,keu10_test.id(1),'PENDING','cabang');
  insert into public.surat_registration_drafts(id,reservation_id,created_by,no_surat)
    values(v_draft,v_reservation,keu10_test.id(1),v_no);
  return jsonb_build_object('no_surat',v_no,'reservation_id',v_reservation,'draft_id',v_draft,
    'entity_id',keu10_test.id(401),'office_id',keu10_test.id(202),'project_id',keu10_test.id(301),
    'dept_id',keu10_test.id(105),'letter_type_id',keu10_test.id(501),'form_usage_id',v_usage,
    'judul_surat','KEU10 disposable acceptance','request_place','Magelang','request_date','2026-10-06',
    'location_snapshot',jsonb_build_object('form',jsonb_build_object('nomor_form','FORGED')),
    'requester_snapshot',jsonb_build_object('full_name','FORGED REQUESTER'),
    'policy_snapshot',jsonb_build_object('keu10_config',jsonb_build_object('approval_threshold',999999999)),
    'data_snapshot',jsonb_build_object('keu10_generation',99),
    'form_input_data',jsonb_build_object('request_category','non_asset','fund_type',p_type,
      'keu10_purpose_code',v_purpose,'fund_amount',1,'grand_total',1,'free_cash',1000000,
      'items',jsonb_build_array(jsonb_build_object('id','line_1','keterangan','Land preparation',
        'jumlah',1,'satuan','Paket','estimasi_harga_satuan',p_amount,'total',1,'status','4'))));
end $$;
create function keu10_test.signers(p_group integer,p_director integer default 6)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('form_usage_step_id',step.id,'user_id',keu10_test.id(case
    when step.step_order=1 then 2 when step.role_name='verifikator' then 3
    when step.role_name='menyetujui' then p_director
    when step.step_order=3 then 6 when p_group=1 then 4 else 5 end)) order by step.step_order)
  from public.form_usage_steps step
  where step.usage_id=('6e102000-0000-4000-8000-'||lpad(p_group::text,12,'0'))::uuid;
$$;
create function keu10_test.approve(p_id uuid,p_step integer)
returns json language plpgsql as $$
declare v_sig public.surat_signatures%rowtype; v_result json;
begin
  select * into v_sig from public.surat_signatures where surat_id=p_id and step_order=p_step;
  perform set_config('request.jwt.claim.sub',v_sig.user_id::text,false);
  v_result := public.handle_approve_surat_v2(v_sig.id,p_id,'Test approval','native://document/'||p_id::text||'/approval/'||gen_random_uuid()::text);
  return v_result;
end $$;
grant execute on all functions in schema keu10_test to authenticated,service_role;

set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.assert((select count(*)=3 from public.form_usages where keu10_config is not null),'Exactly three grouped usages');
select keu10_test.assert((select count(*)=14 from public.form_usage_steps step join public.form_usages usage on usage.id=step.usage_id
  where usage.keu10_config is not null),'4/5/5 mandatory route steps');
select keu10_test.assert((select count(*)=3 from public.form_usage_steps where role_name='verifikator'),'Exactly one Finance verifier per group');
select keu10_test.assert((select nama_form='FORM BIAYA PENGADAAN TANAH & PENGURUSAN IZIN' from public.master_forms
  where nomor_form='FM-UAI.KEU-10-00'),'Canonical template title');
select keu10_test.assert(not has_function_privilege('anon','public.create_keu10_registration(jsonb,jsonb)','execute'),'Anonymous registration denied');
select keu10_test.assert(not has_function_privilege('anon','public.accept_keu10_requester_revision(uuid,jsonb,text,uuid)','execute'),'Anonymous requester revision denied');
select keu10_test.assert(not has_schema_privilege('authenticated','keu10_internal','usage'),'Private mutation permits unavailable to browser');
select keu10_test.assert(not has_schema_privilege('service_role','keu10_internal','usage'),'Private mutation permits unavailable to direct service queries');

-- Administrator can maintain grouped purpose labels and a complete route using
-- the actual established config RPC. Invalid route/policy updates roll back.
do $$ declare v_usage uuid := '6e102000-0000-4000-8000-000000000002'; v_payload jsonb; v_steps jsonb; v_config jsonb; v_result uuid;
begin
  select to_jsonb(usage),usage.keu10_config into v_payload,v_config from public.form_usages usage where id=v_usage;
  select jsonb_agg(to_jsonb(step)||jsonb_build_object('eligible_user_ids',coalesce((
    select jsonb_agg(candidate.user_id) from public.form_usage_step_users candidate where candidate.usage_step_id=step.id),'[]')) order by step_order)
    into v_steps from public.form_usage_steps step where usage_id=v_usage;
  perform keu10_test.expect_error('42501',format('select public.save_form_usage_config(%L,%L,%L::uuid[],%L,%L,%L)',
    v_usage,v_payload,array[keu10_test.id(105)],v_steps,'[]','[]'));
  perform set_config('request.jwt.claim.sub',keu10_test.id(9)::text,false);
  perform keu10_test.expect_error('22023',format('select public.save_form_usage_config(%L,%L,%L::uuid[],%L,%L,%L)',
    v_usage,v_payload,array[keu10_test.id(105)],v_steps-2,'[]','[]'));
  perform keu10_test.expect_error('22023',format('select public.save_form_usage_config(%L,%L,%L::uuid[],%L,%L,%L)',
    v_usage,jsonb_set(v_payload,'{keu10_config,approval_threshold}','2000001'),array[keu10_test.id(105)],v_steps,'[]','[]'));
  v_result := public.save_form_usage_config(v_usage,v_payload,array[keu10_test.id(105)],v_steps,'[]','[]');
  perform keu10_test.assert(v_result=v_usage,'Admin config save preserves usage identity');
  perform keu10_test.assert((select keu10_config=v_config and first_maker_policy='configured' from public.form_usages where id=v_usage),'Admin config save retains KEU10 contract');
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
end $$;

-- Registration is all-or-nothing, including reservation use and complete signers.
do $$ declare v_payload jsonb := keu10_test.payload(1,2,2000000); v_signers jsonb := keu10_test.signers(2,6); v_result jsonb;
begin
  perform keu10_test.expect_error('42501',format('select public.create_surat_registrasi(%L::jsonb)',v_payload));
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,v_signers-0));
  perform keu10_test.assert(not exists(select 1 from public.surat_registrasi where no_surat=v_payload->>'no_surat'),'Missing signer rolls back registration');
  perform keu10_test.assert((select status='PENDING' from public.surat_reservations where id=(v_payload->>'reservation_id')::uuid),'Failed registration preserves reservation');
  perform keu10_test.expect_error('42501',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,
    jsonb_set(v_signers,'{0,user_id}',to_jsonb(keu10_test.id(8)::text))));
  perform keu10_test.expect_error('42501',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,keu10_test.signers(2,7)));
  perform keu10_test.expect_error('42501',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,
    jsonb_set(v_signers,'{2,user_id}',to_jsonb(keu10_test.id(11)::text))));
  perform keu10_test.expect_error('42501',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,
    jsonb_set(v_signers,'{3,user_id}',to_jsonb(keu10_test.id(10)::text))));
  v_result := public.create_keu10_registration(v_payload,v_signers);
  perform keu10_test.assert((v_result->>'created')::boolean,'First registration created=true');
  insert into keu10_test.results(key,surat_id,input) values('main',(v_result#>>'{surat,id}')::uuid,jsonb_build_object('payload',v_payload,'signers',v_signers));
  perform keu10_test.assert(v_result#>>'{surat,form_input_data,fund_amount}'='2000000','Ignore forged browser total');
  perform keu10_test.assert(v_result#>>'{surat,form_input_data,fund_type}'='marketing_cost','Retain explicitly selected marketing type');
  perform keu10_test.assert(not ((v_result#>'{surat,form_input_data}') ? 'free_cash'),'Strip KEU1 Free Cash');
  perform keu10_test.assert(not ((v_result#>'{surat,form_input_data,items,0}') ? 'status'),'Strip PGD item status');
  perform keu10_test.assert(v_result#>>'{surat,location_snapshot,form,nomor_form}'='FM-UAI.KEU-10-00','Server authors form identity');
  perform keu10_test.assert(v_result#>>'{surat,requester_snapshot,full_name}'='Requester','Server authors requester identity');
  perform keu10_test.assert(v_result#>>'{surat,data_snapshot,keu10_generation}'='1','Browser cannot choose generation');
  v_result := public.create_keu10_registration(v_payload,v_signers);
  perform keu10_test.assert(v_result->>'created'='false','Retry created=false');
  perform keu10_test.assert((select count(*)=4 from public.surat_signatures where surat_id=(v_result#>>'{surat,id}')::uuid),'Retry does not duplicate signatures');
  perform keu10_test.assert((select count(*)=1 from public.document_pdf_jobs where surat_id=(v_result#>>'{surat,id}')::uuid),'Exactly one initial frozen PDF job');
end $$;

-- Input enum, purpose, bounds and ownership fail closed without defaulting.
do $$ declare v_payload jsonb := keu10_test.payload(2,2,2000001); v_signers jsonb := keu10_test.signers(2,7); v_result jsonb;
begin
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    jsonb_set(v_payload,'{form_input_data,fund_type}','"unknown"'),v_signers));
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    v_payload#-'{form_input_data,fund_type}',v_signers));
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    jsonb_set(v_payload,'{form_input_data,keu10_purpose_code}','"other"'),v_signers));
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    jsonb_set(v_payload,'{form_input_data,items,0,jumlah}','0'),v_signers));
  perform keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    jsonb_set(v_payload,'{form_input_data,items,0,estimasi_harga_satuan}','9007199254740992'),v_signers));
  perform keu10_test.expect_error('P0001',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',
    jsonb_set(v_payload,'{project_id}',to_jsonb(keu10_test.id(302)::text)),v_signers));
  perform set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
  perform keu10_test.expect_error('P0001',format('select public.create_keu10_registration(%L::jsonb,%L::jsonb)',v_payload,v_signers));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  v_result := public.create_keu10_registration(v_payload,v_signers);
  insert into keu10_test.results(key,surat_id) values('above',(v_result#>>'{surat,id}')::uuid);
end $$;

-- Pure normalizer accepts all three documented types, never an implicit type.
do $$ declare v_input jsonb; v_config jsonb; v_type text;
begin
  select form_input_data,policy_snapshot->'keu10_config' into v_input,v_config from public.surat_registrasi
    where id=(select surat_id from keu10_test.results where key='main');
  foreach v_type in array array['operational','production_cost','marketing_cost'] loop
    perform keu10_test.assert(public.normalize_keu10_input(v_input||jsonb_build_object('fund_type',v_type),v_config)->>'fund_type'=v_type,'Fund type preserved: '||v_type);
  end loop;
end $$;

-- Users cannot forge canonical updates, signature state, permits or history.
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main');
begin
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set form_input_data=%L where id=%L','{}',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set current_step=4,status=%L where id=%L','DONE',v_id));
  perform keu10_test.expect_error('42501',format('update public.surat_signatures set is_signed=true where surat_id=%L',v_id));
  perform set_config('keu10.mutation_permit','true',true);
  perform keu10_test.expect_error('42501',format('update public.surat_registrasi set current_step=4 where id=%L',v_id));
  perform keu10_test.expect_error('42501',format('insert into keu10_internal.mutation_permits values(txid_current(),%L,%L)',v_id,'approval'));
  perform keu10_test.assert(not has_function_privilege('authenticated','public.handle_approve_surat_v2_pre_keu10(uuid,uuid,text,text)','execute'),'Old approval RPC is private');
  perform keu10_test.assert(not has_function_privilege('authenticated','public.request_surat_process_revision_pre_keu10(uuid,uuid,text,integer,text,jsonb)','execute'),'Old revision RPC is private');
end $$;

-- Out-of-order approval is rejected; BM and manager advance to Finance.
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main'); v_sig uuid;
begin
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=3;
  perform set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
  perform keu10_test.expect_error('42501',format('select public.handle_approve_surat_v2(%L,%L,null,null)',v_sig,v_id));
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  perform keu10_test.assert((select current_step=3 from public.surat_registrasi where id=v_id),'Finance stage reached');
end $$;

-- Freeze original PDF source before Finance correction; it must become stale.
reset role;
update public.document_pdf_jobs set status='processing',lease_token=keu10_test.id(8001),lease_expires_at=now()+interval '1 hour'
  where surat_id=(select surat_id from keu10_test.results where key='main') and signature_id is null;
update keu10_test.results set pdf_job=job.id,pdf_snapshot=job.render_payload
  from public.document_pdf_jobs job where key='main' and job.surat_id=keu10_test.results.surat_id and job.signature_id is null;
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(3)::text,false);
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main'); v_sig uuid; v_event uuid; v_changes jsonb;
begin
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=3;
  v_changes := jsonb_build_object('keu10_proposed_input',jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
    'id','line_1','keterangan','Corrected land preparation','jumlah',1,'satuan','Paket','estimasi_harga_satuan',3000000))));
  perform keu10_test.expect_error('22023',format('select public.request_surat_process_revision(%L,%L,%L,1,%L,%L)',v_id,v_sig,'requester','four',v_changes));
  v_event := public.request_surat_process_revision(v_id,v_sig,'requester',1,'Correct quantity and price',v_changes);
  update keu10_test.results set event_id=v_event where key='main';
  perform keu10_test.assert((select form_input_data->>'fund_amount'='2000000' from public.surat_registrasi where id=v_id),'Proposal does not change live amount before confirmation');
  perform keu10_test.expect_error('42501',format('select public.accept_surat_process_revision(%L,null)',v_event));
  perform keu10_test.expect_error('42501',format('select public.resolve_surat_process_revision(%L,null)',v_event));
  perform keu10_test.expect_error('42501',format('update public.surat_revision_events set changes=%L where id=%L','{}',v_event));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform keu10_test.expect_error('42501',format('select public.accept_surat_process_revision(%L,null)',v_event));
  perform keu10_test.assert(not exists(select 1 from public.surat_external_revision_history where surat_id=v_id),'Ambiguous director rolls back revision/history');
  perform keu10_test.expect_error('42501',format('select public.accept_keu10_requester_revision(%L,null,null,%L)',v_event,keu10_test.id(6)));
  perform keu10_test.assert(public.accept_keu10_requester_revision(v_event,null,'Requester agrees',keu10_test.id(7)),'Requester confirms correction and eligible director');
  perform keu10_test.assert((select form_input_data->>'fund_amount'='3000000' and current_step=1 and status='PROSES'
    and data_snapshot->>'keu10_generation'='2' from public.surat_registrasi where id=v_id),'Revision increases amount and restarts BM');
  perform keu10_test.assert((select bool_and(not is_signed and signed_at is null) from public.surat_signatures where surat_id=v_id),'All signatures reset');
  perform keu10_test.assert((select user_id=keu10_test.id(7) and label_jabatan='Direktur Utama' from public.surat_signatures where surat_id=v_id and step_order=4),'Threshold crossing changes final approver and label to DU');
  perform keu10_test.assert((select document_snapshot#>>'{form_input_data,fund_amount}'='2000000'
    and signatures_snapshot @> '[{"step_order":1,"is_signed":true}]'::jsonb from public.surat_external_revision_history where surat_id=v_id),'History retains old values and BM signature');
  perform keu10_test.expect_error('40001',format('select public.accept_surat_process_revision(%L,null)',v_event));
  perform keu10_test.expect_error('42501',format('update public.surat_external_revision_history set document_snapshot=%L where surat_id=%L','{}',v_id));
  perform keu10_test.assert((select job.render_payload=result.pdf_snapshot from public.document_pdf_jobs job
    join keu10_test.results result on result.pdf_job=job.id where result.key='main'),'Old frozen PDF snapshot unchanged');
end $$;

set role service_role;
do $$ declare v_job uuid := (select pdf_job from keu10_test.results where key='main');
begin
  perform keu10_test.expect_error('42501',format('select public.complete_document_pdf_job(%L,%L,%L)',v_job,'https://example.invalid/old.pdf',keu10_test.id(8002)));
  perform keu10_test.expect_error('40001',format('select public.complete_document_pdf_job(%L,%L,%L)',v_job,'https://example.invalid/old.pdf',keu10_test.id(8001)));
  perform keu10_test.expect_error('42501',format('update public.document_pdf_jobs set render_payload=%L where id=%L','{}',v_job));
end $$;

set role authenticated;
-- Frozen route is unaffected when an admin edits live candidate configuration.
reset role;
delete from public.form_usage_step_users candidate using public.form_usage_steps step
  where step.id=candidate.usage_step_id and step.usage_id='6e102000-0000-4000-8000-000000000002' and step.role_name='memeriksa';
set role authenticated;
select keu10_test.approve((select surat_id from keu10_test.results where key='main'),1);
select keu10_test.approve((select surat_id from keu10_test.results where key='main'),2);
select keu10_test.approve((select surat_id from keu10_test.results where key='main'),3);
select keu10_test.approve((select surat_id from keu10_test.results where key='main'),4);
select keu10_test.assert((select status='DONE' from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='main')),'Finance signature and current DU finish revised generation');

-- Latest signed PDF publishes into both signature and document cache atomically.
reset role;
update public.document_pdf_jobs set status='processing',lease_token=keu10_test.id(8003),lease_expires_at=now()+interval '1 hour'
  where signature_id=(select id from public.surat_signatures where surat_id=(select surat_id from keu10_test.results where key='main') and step_order=4);
set role service_role;
select (public.complete_document_pdf_job(job.id,'https://example.invalid/current.pdf',keu10_test.id(8003))).id from public.document_pdf_jobs job
  join public.surat_signatures sig on sig.id=job.signature_id where sig.surat_id=(select surat_id from keu10_test.results where key='main') and sig.step_order=4;
select keu10_test.assert((select pdf_path='https://example.invalid/current.pdf' from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='main')),'Current PDF pointer published');

-- Both fixed routes require Director I examination and DU final approval.
reset role;
insert into public.form_usage_step_users(usage_step_id,user_id) select id,keu10_test.id(5) from public.form_usage_steps
  where usage_id='6e102000-0000-4000-8000-000000000002' and role_name='memeriksa';
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_payload jsonb; v_result jsonb; v_id uuid; v_group integer; v_n integer;
begin
  for v_group in select unnest(array[1,3]) loop
    v_n := 10+v_group; v_payload := keu10_test.payload(v_n,v_group,1,'production_cost');
    perform keu10_test.expect_error('42501',format('select public.create_keu10_registration(%L,%L)',v_payload,keu10_test.signers(v_group,6)));
    v_result := public.create_keu10_registration(v_payload,keu10_test.signers(v_group,7));
    v_id := (v_result#>>'{surat,id}')::uuid;
    perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2); perform keu10_test.approve(v_id,3);
    perform keu10_test.approve(v_id,4); perform keu10_test.approve(v_id,5);
    perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=v_id),'Fixed group completes all five stages');
    perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  end loop;
  v_payload := keu10_test.payload(20,2,1000,'operational');
  v_result := public.create_keu10_registration(v_payload,keu10_test.signers(2,6));
  insert into keu10_test.results(key,surat_id) values('concurrency',(v_result#>>'{surat,id}')::uuid);
end $$;

-- An ordinary manager return can be corrected by the actual requester only,
-- without direct row edits or changing the reserved number/project/form.
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='above');
  v_sig uuid; v_event uuid; v_items jsonb;
begin
  perform keu10_test.approve(v_id,1);
  perform set_config('request.jwt.claim.sub',keu10_test.id(5)::text,false);
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=2;
  v_event := public.request_surat_process_revision(v_id,v_sig,'requester',1,'Requester must update the estimate','{}');
  v_items := jsonb_build_array(jsonb_build_object('id','line_1','keterangan','Requester corrected estimate',
    'jumlah',1,'satuan','Paket','estimasi_harga_satuan',2000000));
  perform keu10_test.expect_error('42501',format('select public.accept_keu10_requester_revision(%L,%L,%L,%L)',v_event,v_items,'Corrected estimate',keu10_test.id(6)));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform keu10_test.expect_error('22023',format('select public.accept_keu10_requester_revision(%L,%L,%L,%L)',v_event,v_items,'four',keu10_test.id(6)));
  perform keu10_test.assert(public.accept_keu10_requester_revision(v_event,v_items,'Corrected estimate',keu10_test.id(6)),'Actual requester edits a normal return');
  perform keu10_test.assert((select form_input_data->>'fund_amount'='2000000' and current_step=1
    and project_id=keu10_test.id(301) and no_surat='002/TEST/KEU10/X/2026' from public.surat_registrasi where id=v_id),'Requester correction preserves identity and recomputes amount');
  perform keu10_test.assert((select user_id=keu10_test.id(6) and label_jabatan='Direktur I' from public.surat_signatures where surat_id=v_id and step_order=4),'Downward threshold crossing selects DI and its label');
  perform keu10_test.assert((select changes->>'requester_corrected_items'='true' from public.surat_revision_events where id=v_event),'Requester edit is audited');
end $$;

-- Non-KEU10 registration, signature validation, return, confirmation and PDF
-- completion continue through unmodified canonical bodies.
reset role;
insert into public.master_forms(id,nama_form,nomor_form) values(keu10_test.id(950),'PGD','FM-UAI.PGD-01-00');
insert into public.form_usages(id,form_id,name,request_category,scope_type,status) values(keu10_test.id(951),keu10_test.id(950),'Non-KEU10','non_asset','cabang','active');
insert into public.form_usage_departments values(keu10_test.id(951),keu10_test.id(105));
insert into public.form_usage_steps(id,usage_id,step_order,role_name,label,action_type,assignee_mode) values
 (keu10_test.id(952),keu10_test.id(951),1,'membuat','Requester','approval','requester'),
 (keu10_test.id(953),keu10_test.id(951),2,'menyetujui','Business','approval','select');
insert into public.form_usage_step_users values(keu10_test.id(953),keu10_test.id(5));
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_payload jsonb := keu10_test.payload(30,2,1000); v_surat public.surat_registrasi%rowtype; v_sig uuid; v_event uuid;
begin
  v_payload := v_payload||jsonb_build_object('form_usage_id',keu10_test.id(951),'policy_snapshot','{}'::jsonb,'data_snapshot','{}'::jsonb,
    'form_input_data',jsonb_build_object('request_category','non_asset'),'file_path','native://document/non-keu10/1');
  v_surat := public.create_surat_registrasi(v_payload);
  insert into public.surat_signatures(surat_id,user_id,form_usage_step_id,step_order,role_name) values
    (v_surat.id,keu10_test.id(1),keu10_test.id(952),1,'membuat'),
    (v_surat.id,keu10_test.id(5),keu10_test.id(953),2,'menyetujui');
  perform keu10_test.approve(v_surat.id,1);
  select id into v_sig from public.surat_signatures where surat_id=v_surat.id and step_order=2;
  perform set_config('request.jwt.claim.sub',keu10_test.id(5)::text,false);
  v_event := public.request_surat_process_revision(v_surat.id,v_sig,'requester',1,'Review ordinary document','{}');
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform keu10_test.assert(public.accept_surat_process_revision(v_event,'Continue ordinary document'),'Non-KEU10 revision acceptance preserved');
  perform keu10_test.approve(v_surat.id,1); perform keu10_test.approve(v_surat.id,2);
  perform keu10_test.assert((select status='DONE' from public.surat_registrasi where id=v_surat.id),'Non-KEU10 completes');
  insert into keu10_test.results(key,surat_id) values('non_keu10',v_surat.id);
end $$;
reset role;
insert into public.document_pdf_jobs(surat_id,source_file_path,requested_by)
  select surat.id,surat.file_path,surat.created_by from public.surat_registrasi surat
    where surat.id=(select surat_id from keu10_test.results where key='non_keu10');
update public.document_pdf_jobs set status='processing',lease_token=keu10_test.id(8004),lease_expires_at=now()+interval '1 hour'
  where surat_id=(select surat_id from keu10_test.results where key='non_keu10') and signature_id is null;
set role service_role;
select (public.complete_document_pdf_job(job.id,'https://example.invalid/non-keu10.pdf',keu10_test.id(8004))).id from public.document_pdf_jobs job
 where job.surat_id=(select surat_id from keu10_test.results where key='non_keu10') and job.signature_id is null;
select keu10_test.assert((select pdf_path='https://example.invalid/non-keu10.pdf' from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='non_keu10')),'Non-KEU10 PDF delegates');
reset role;
-- Regenerating an earlier signature excludes later approvals.
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main'); v_job public.document_pdf_jobs%rowtype;
begin
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
    select surat_id,id,file_path_snap,keu10_test.id(1),true from public.surat_signatures
    where surat_id=v_id and step_order=1 returning * into v_job;
  perform keu10_test.assert(v_job.render_payload->'signatures' @> '[{"step_order":1,"is_signed":true},{"step_order":4,"is_signed":false}]',
    'Earlier signature PDF excludes subsequent approvals');
end $$;
-- Disposable fixtures only, no HTTP POST or live database.
insert into public.marison_outbound_dispatches(surat_id,environment,status,post_started_at,response)
  select surat_id,'staging','succeeded',now(),'{"ok":true}' from keu10_test.results where key='main';
set role service_role;
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main'); v_result jsonb;
begin
  v_result := public.apply_external_submission_decision(keu10_test.id(8100),'001/TEST/KEU10/X/2026',
    'revision_required','Correct vendor estimate',now(),repeat('a',64),'staging');
  perform keu10_test.assert(v_result->>'revision_generation'='2','Vendor generation follows internal generation');
  update keu10_test.results set event_id=(v_result->>'revision_event_id')::uuid where key='main';
  perform keu10_test.assert((select count(*)=2 from public.surat_external_revision_history where surat_id=v_id),'Vendor revision freezes history once');
  v_result := public.apply_external_submission_decision(keu10_test.id(8100),'001/TEST/KEU10/X/2026',
    'revision_required','Correct vendor estimate',now(),repeat('a',64),'staging');
  perform keu10_test.assert(v_result->>'idempotent'='true','Vendor retry is idempotent');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_id uuid := (select surat_id from keu10_test.results where key='main');
  v_event uuid := (select event_id from keu10_test.results where key='main'); v_draft public.surat_registration_drafts%rowtype; v_payload jsonb;
begin
  v_draft := public.create_external_submission_revision_draft(v_event);
  perform keu10_test.expect_error('42501',format('select public.accept_surat_process_revision(%L,null)',v_event));
  perform keu10_test.expect_error('42501',format('select public.accept_keu10_requester_revision(%L,null,null,%L)',v_event,keu10_test.id(7)));
  select to_jsonb(surat)||jsonb_build_object('form_input_data',form_input_data||jsonb_build_object(
    'fund_type','marketing_cost','items',jsonb_build_array(jsonb_build_object('id','line_1',
      'keterangan','Vendor corrected estimate','jumlah',1,'satuan','Paket','estimasi_harga_satuan',1000000))))
    into v_payload from public.surat_registrasi surat where id=v_id;
  update public.surat_registration_drafts set signer_assignments=keu10_test.signers(2,6) where id=v_draft.id;
  perform set_config('request.jwt.claim.sub',keu10_test.id(12)::text,false);
  perform keu10_test.expect_error('42501',format('select public.submit_external_submission_revision(%L,%L,%L,%L)',v_event,v_draft.id,v_payload,'Vendor correction'));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform public.submit_external_submission_revision(v_event,v_draft.id,v_payload,'Vendor correction');
  perform keu10_test.assert((select form_input_data->>'fund_amount'='1000000' and current_step=1 and status='PROSES'
    and data_snapshot->>'keu10_generation'='3' from public.surat_registrasi where id=v_id),'Vendor correction starts new BM generation');
  perform keu10_test.assert((select count(*)=2 from public.surat_external_revision_history where surat_id=v_id),'Vendor confirmation does not duplicate frozen history');
  perform keu10_test.assert((select data_snapshot#>>'{applied_revision,history_generation}'='2' from public.surat_registrasi where id=v_id),'Vendor acceptance points to actual frozen history');
  perform keu10_test.assert((select user_id=keu10_test.id(6) from public.surat_signatures where surat_id=v_id and step_order=4),'Vendor correction reroutes threshold');
  perform keu10_test.approve(v_id,1); perform keu10_test.approve(v_id,2);
  perform keu10_test.approve(v_id,3); perform keu10_test.approve(v_id,4);
end $$;
set role service_role;
select public.apply_external_submission_decision(keu10_test.id(8101),'001/TEST/KEU10/X/2026',
  'rejected','Vendor terminal rejection',now(),repeat('b',64),'staging');
select keu10_test.assert((select status='REJECTED' from public.surat_registrasi where id=(select surat_id from keu10_test.results where key='main')),'Canonical vendor rejection remains available');
set role authenticated;
select keu10_test.assert(not has_function_privilege('authenticated','public.apply_external_submission_decision_pre_keu10(uuid,text,text,text,timestamptz,text,text)','execute'),'Vendor bypass is private');
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
select keu10_test.expect_error('22023',format('select public.create_keu10_registration(%L,%L)',keu10_test.payload(99,2,0),keu10_test.signers(2,6)));
reset role;
-- Both deployments currently lack job_title_display; also certify an installation
-- that has it and stores its canonical director identity there instead.
alter table public.profiles add column job_title_display text;
update public.profiles set job_title='Manager',job_title_display='Direktur I' where id=keu10_test.id(6);
set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_result jsonb; v_id uuid; v_sig uuid; v_event uuid; v_candidate record;
begin
  v_result := public.create_keu10_registration(keu10_test.payload(41,2,1000),keu10_test.signers(2,6));
  v_id := (v_result#>>'{surat,id}')::uuid;
  select id into v_sig from public.surat_signatures where surat_id=v_id and step_order=1;
  perform set_config('request.jwt.claim.sub',keu10_test.id(2)::text,false);
  v_event := public.request_surat_process_revision(v_id,v_sig,'requester',1,'Correct the request details','{}');
  perform keu10_test.expect_error('42501',format('select public.get_keu10_revision_final_candidates(%L)',v_event));
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  select * into v_candidate from public.get_keu10_revision_final_candidates(v_event) where id=keu10_test.id(6);
  perform keu10_test.assert(v_candidate.job_title='Direktur I','Candidate API resolves canonical display title without exposing profile fields');
end $$;
reset role;
do $$ begin raise notice 'KEU10 workflow: all assertions passed'; end $$;
