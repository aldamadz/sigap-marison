set role authenticated;
do $$ declare v_old record; v_step integer;
begin
  for v_old in select * from keu10_test.results where key like 'legacy_type_%' loop
    for v_step in 1..4 loop
      perform keu10_test.approve(v_old.surat_id,v_step);
    end loop;
    perform keu10_test.assert((select status='DONE' and form_input_data=v_old.input->'input'
      and policy_snapshot=v_old.input->'policy' from public.surat_registrasi where id=v_old.surat_id),
      'Legacy registration approves without rewriting its input or policy');
    perform keu10_test.assert((select render_payload=v_old.input->'initial_pdf' from public.document_pdf_jobs
      where surat_id=v_old.surat_id and signature_id is null),'Legacy initial PDF snapshot stays frozen');
  end loop;
end $$;
reset role;
do $$ begin raise notice 'KEU10 legacy fund types: pre-migration registrations approved unchanged'; end $$;
