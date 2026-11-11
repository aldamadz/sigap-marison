begin;
update public.profiles set full_name='Pemeriksa Perencanaan' where id='61200000-0000-4000-8000-000000000002';
insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step,form_input_data)
values('61200000-0000-4000-8000-000000000091','61200000-0000-4000-8000-000000000001',
 '051/UAI/MKT.1.SGN/X/2026','Pengajuan SPK Unit: 30 Unit Marison Sragen Dept. Marketing Kantor Pusat','PROSES',3,
 '{"request_mode":"unit","request_category":"unit","requested_project":{"id":"23","code":"TEST"},"requested_unit_count":30,"catatan":"Bangun bertahap."}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,requires_unit_allocation,action_type,verification_required,verification_status,verifier_snapshot)
values('61200000-0000-4000-8000-000000000092','61200000-0000-4000-8000-000000000091',
 '61200000-0000-4000-8000-000000000001',3,true,'unit_allocation',true,'pending',
 '[{"user_id":"61200000-0000-4000-8000-000000000002"}]');
insert into public.surat_signatures(id,surat_id,user_id,step_order,is_signed,signed_at,pdf_path_snap)
values('61200000-0000-4000-8000-000000000093','61200000-0000-4000-8000-000000000091',
 '61200000-0000-4000-8000-000000000001',1,true,'2026-11-01','archive-original.pdf');
set local role authenticated;
set local "request.jwt.claim.sub"='61200000-0000-4000-8000-000000000002';
select public.verify_surat_signature_v2('61200000-0000-4000-8000-000000000092','Baru 3 kavling siap bangun.',
 '{"allocated_project":{"id":"23","code":"TEST"},"allocated_units":[{"value":"2048"},{"value":"2074"},{"value":"2173"}]}');
reset role;
do $$begin
 if (select judul_surat from public.surat_registrasi where id='61200000-0000-4000-8000-000000000091')
  <>'Pengajuan SPK Unit: 3 Unit Marison Sragen Dept. Marketing Kantor Pusat' then
  raise exception 'Verified title still describes the 30 requested units';end if;
 if (select form_input_data->>'requested_unit_count'<>'30' or no_surat<>'051/UAI/MKT.1.SGN/X/2026'
   or status<>'PROSES' or current_step<>3 or form_input_data->>'catatan'<>'Bangun bertahap.'
   from public.surat_registrasi where id='61200000-0000-4000-8000-000000000091') then
  raise exception 'Original request/number/lifecycle changed';end if;
 if not exists(select 1 from public.surat_unit_allocation_history
  where surat_id='61200000-0000-4000-8000-000000000091' and requested_count=30 and allocated_count=3 and remaining_count=27
   and actor_name='Pemeriksa Perencanaan' and note='Baru 3 kavling siap bangun.') then
  raise exception 'Original allocation evidence lost';end if;
 if not exists(select 1 from public.surat_signatures where id='61200000-0000-4000-8000-000000000093'
   and is_signed and signed_at='2026-11-01' and pdf_path_snap='archive-original.pdf') then
  raise exception 'Prior signed archive changed';end if;
 if exists(select 1 from presentation_authority_before b,pg_proc p where p.oid='public.get_verified_unit_allocation(uuid)'::regprocedure
   and (b.proowner<>p.proowner or b.proacl is distinct from p.proacl)) then
  raise exception 'Authority owner or ACL changed';end if;
 if has_function_privilege('authenticated','unit_allocation_internal.title_for_count(text,integer)','execute')
   or has_function_privilege('service_role','unit_allocation_internal.update_verified_title()','execute') then
  raise exception 'Private helpers exposed';end if;
 if unit_allocation_internal.title_for_count('SPK 30 Unit tipe 30/60 tahun 2026',3)<>'SPK 3 Unit tipe 30/60 tahun 2026'
   or unit_allocation_internal.title_for_count('Rumah Sragen',3)<>'Rumah Sragen (3 Unit)'
   or unit_allocation_internal.title_for_count(null,3)<>'Pengajuan SPK Unit: 3 Unit' then
  raise exception 'Title formatter changed unrelated text';end if;
end $$;
-- A row-level marker is not examiner provenance; the private getter overwrites it.
set local role postgres;
update public.surat_registrasi set form_input_data=form_input_data||'{"allocated_review":{"actor_name":"Forged","note":"Forged"}}'
 where id='61200000-0000-4000-8000-000000000091';
reset role;
set local role service_role;
do $$declare result jsonb:=public.get_verified_unit_allocation('61200000-0000-4000-8000-000000000091');begin
 if result#>>'{allocated_review,actor_name}'<>'Pemeriksa Perencanaan'
  or result#>>'{allocated_review,note}'<>'Baru 3 kavling siap bangun.' then
  raise exception 'Client metadata overrode examiner provenance';end if;
end $$;
reset role;
update public.surat_registrasi set judul_surat='Pengajuan SPK Unit: 30 Unit Marison Sragen Dept. Marketing Kantor Pusat'
 where id='61200000-0000-4000-8000-000000000091';
do $$begin
 if (select judul_surat from public.surat_registrasi where id='61200000-0000-4000-8000-000000000091')
   not like 'Pengajuan SPK Unit: 3 Unit %' then raise exception 'Reopened title lost valid allocation';end if;
end $$;
set local role postgres;
update public.surat_registrasi set form_input_data=form_input_data-'allocated_units'-'allocated_by_signature_id'
 where id='61200000-0000-4000-8000-000000000091';
reset role;
do $$begin
 if (select judul_surat from public.surat_registrasi where id='61200000-0000-4000-8000-000000000091')
   not like 'Pengajuan SPK Unit: 30 Unit %' then raise exception 'Invalidated allocation still advertises ready units';end if;
end $$;
rollback;
select 'Verified Unit presentation assertions passed';
