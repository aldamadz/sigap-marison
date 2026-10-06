set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
do $$ declare v_type text; v_n integer := 900; v_result jsonb; v_id uuid;
begin
  foreach v_type in array array['production_cost','marketing_cost'] loop
    v_n := v_n + 1;
    v_result := public.create_keu10_registration(keu10_test.payload(v_n,2,1500000,v_type),keu10_test.signers(2,6));
    v_id := (v_result#>>'{surat,id}')::uuid;
    perform keu10_test.assert(v_result#>>'{surat,form_input_data,fund_type}'=v_type,'Old version stores explicit type');
    insert into keu10_test.results(key,surat_id,input)
      select 'legacy_type_'||v_type,v_id,jsonb_build_object('input',form_input_data,'policy',policy_snapshot,
        'initial_pdf',(select render_payload from public.document_pdf_jobs where surat_id=v_id and signature_id is null))
      from public.surat_registrasi where id=v_id;
  end loop;
end $$;
reset role;
