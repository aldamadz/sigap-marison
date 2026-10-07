insert into public.surat_registrasi(id,form_usage_id,office_id,dept_id,created_by,form_input_data)
values('48400000-0000-4000-8000-000000000005','48400000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001','{"items":[{"nama_barang":"Air","jumlah":2},{"nama_barang":"Material","jumlah":3}]}');
insert into public.surat_signatures(id,surat_id,user_id,form_usage_step_id)
values('48400000-0000-4000-8000-000000000006','48400000-0000-4000-8000-000000000005',
 '40000000-0000-4000-8000-000000000007','48400000-0000-4000-8000-000000000004');
do $$
declare
 v_id uuid:='48400000-0000-4000-8000-000000000006';
 v_items jsonb;
 v_checks jsonb;
 v_invalid jsonb;
 v_payload jsonb;
begin
 if (select count(*) from pg_publication_tables where pubname='supabase_realtime')<>5 then raise exception 'Missing publication tables'; end if;
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='profiles') then raise exception 'Profile publication leak'; end if;
 if has_function_privilege('authenticated','public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)','execute')
   or has_function_privilege('authenticated','public.verify_surat_signature_pre_fund_items(uuid,text)','execute') then raise exception 'Internal verifier is public'; end if;
 if not exists(select 1 from public.surat_signatures where id=v_id and verification_required and verification_status='pending'
   and action_type='configured_input' and input_schema_snapshot->>'review_mode'='fund_item_checklist') then raise exception 'Future signature configuration not snapshotted'; end if;
 select form_input_data->'items' into v_items from public.surat_registrasi where id='48400000-0000-4000-8000-000000000005';
 select jsonb_agg(jsonb_build_object('item_index',n-1,'item',value,'checked',true,'note','')) into v_checks
 from jsonb_array_elements(v_items) with ordinality t(value,n);
 perform set_config('request.jwt.claim.sub','','true');
 begin perform public.verify_surat_signature_v2(v_id,null,jsonb_build_object('checker_input',jsonb_build_object('item_checks',v_checks::text)));
   raise exception 'Anon passed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
 begin perform public.verify_surat_signature_v2(v_id,null,'{}'); raise exception 'Requester bypassed checker'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','48400000-0000-4000-8000-000000000001',true);
 begin perform public.verify_surat_signature(v_id); raise exception 'Legacy unchecked bypass'; exception when invalid_parameter_value then null; end;
 for v_invalid in select value from jsonb_array_elements(jsonb_build_array(
   '[]'::jsonb, jsonb_build_array(v_checks->0), jsonb_set(v_checks,'{0,checked}','false'),
   jsonb_set(v_checks,'{0,item,jumlah}','999'),jsonb_build_array(v_checks->0,v_checks->0),
   jsonb_set(v_checks,'{0,note}',to_jsonb(repeat('x',2001))))) loop
   begin
     perform public.verify_surat_signature_v2(v_id,null,jsonb_build_object('checker_input',jsonb_build_object('item_checks',v_invalid::text)));
     raise exception 'Invalid checklist passed: %',v_invalid;
   exception when invalid_parameter_value then null; end;
 end loop;
 v_payload:=jsonb_build_object('checker_input',jsonb_build_object('item_checks',v_checks::text));
 -- The legacy entry point validates a saved draft, not merely its non-empty string.
 update public.surat_registrasi set data_snapshot=jsonb_build_object('verification_drafts',jsonb_build_object(v_id::text,jsonb_build_object('input',v_payload)))
 where id='48400000-0000-4000-8000-000000000005';
 if not public.verify_surat_signature(v_id,'All items checked') then raise exception 'Valid checklist rejected'; end if;
 if not exists(select 1 from public.surat_signatures where id=v_id and verification_status='verified' and verified_by=auth.uid() and not is_signed) then raise exception 'Verification changed manager signature or lost actor'; end if;
 if (select form_input_data->'items' from public.surat_registrasi where id='48400000-0000-4000-8000-000000000005')<>v_items then raise exception 'Requested items mutated'; end if;
 if not exists(select 1 from public.surat_registrasi where id='48400000-0000-4000-8000-000000000005'
   and data_snapshot#>>array['verification_inputs',v_id::text,'verified_by']=auth.uid()::text
   and (form_input_data#>>array['checker_inputs',v_id::text,'item_checks'])::jsonb=v_checks) then raise exception 'Verification result or audit missing'; end if;
 raise notice 'Fund item checklist: all assertions passed';
end $$;
