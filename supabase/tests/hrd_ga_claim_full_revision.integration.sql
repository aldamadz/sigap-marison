set role authenticated;
select set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
select public.claim_hrd_ga_examination(keu10_test.id(9973));
do $$declare proposal jsonb;event uuid;original jsonb;draft public.surat_registration_drafts;
begin
  original:=keu10_test.full_form(keu10_test.id(9971));
  proposal:=jsonb_set(original,'{form_input_data,items,0,jumlah}','10');
  perform set_config('request.jwt.claim.sub',keu10_test.id(9975)::text,false);
  perform keu10_test.expect_error('42501',format('select public.request_surat_process_revision(%L,%L,''requester'',null,''Stok hanya tersedia 10 rim'',%L)',
    keu10_test.id(9971),keu10_test.id(9973),jsonb_build_object('signer_proposed_form',proposal)));
  perform set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
  event:=public.request_surat_process_revision(keu10_test.id(9971),keu10_test.id(9973),'requester',null,'Stok hanya tersedia 10 rim',jsonb_build_object('signer_proposed_form',proposal));
  perform keu10_test.assert((select actor_id=keu10_test.id(9974) and changes#>>'{signer_proposed_form,form_input_data,items,0,jumlah}'='10'
    and changes#>>'{requester_revision_base,document,form_input_data,items,0,jumlah}'='30' from public.surat_revision_events where id=event),'Claimant full proposal preserves before/after and attribution');
  perform set_config('request.jwt.claim.sub',keu10_test.id(1)::text,false);
  perform public.accept_surat_process_revision(event,'Setuju pemenuhan 10 rim');
  perform keu10_test.assert((select form_input_data#>>'{items,0,jumlah}'='10' and current_step=2 and status='PROSES'
    from public.surat_registrasi where id=keu10_test.id(9971)),'Requester confirmation resumes same manager stage');
  perform keu10_test.assert((select verification_claimed_by=keu10_test.id(9974) from public.surat_signatures where id=keu10_test.id(9973)),'Claim survives accepted revision');
  perform set_config('request.jwt.claim.sub',keu10_test.id(9974)::text,false);
  perform public.verify_surat_signature_v2(keu10_test.id(9973),'Siap dipenuhi 10 rim','{}');
  perform keu10_test.assert((select not is_signed and verified_by=keu10_test.id(9974) from public.surat_signatures where id=keu10_test.id(9973)),'Examiner completion does not sign for manager');
end $$;
reset role;
select 'HRD GA full revision: all assertions passed';
