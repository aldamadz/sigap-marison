reset role;
insert into public.profiles(id,full_name,job_title,department_id,office_id) select
  keu10_test.id(n),name,'Pemeriksa',department_id,office_id from public.profiles p
  cross join (values(9974,'Usman fixture'),(9975,'Tri fixture')) v(n,name) where p.id=keu10_test.id(3);
insert into public.surat_registrasi(id,no_surat,created_by,judul_surat,request_place,request_date,current_step,file_path,form_input_data)
values(keu10_test.id(9971),'CLAIM/REVISION/TEST',keu10_test.id(1),'ATK dari stok','Magelang','2026-11-12',2,'native://document/claim-revision',
  '{"request_category":"asset","items":[{"id":"a","nama_barang":"Kertas","jumlah":30,"sat":"Rim"}]}');
insert into public.surat_signatures(id,surat_id,user_id,step_order,role_name,is_signed,status,verification_required,verification_status,verifier_snapshot,input_schema_snapshot)
values
  (keu10_test.id(9972),keu10_test.id(9971),keu10_test.id(1),1,'membuat',true,'APPROVED',false,'not_required','[]','{}'),
  (keu10_test.id(9973),keu10_test.id(9971),keu10_test.id(3),2,'memeriksa',false,'PENDING',true,'pending',
    jsonb_build_array(jsonb_build_object('user_id',keu10_test.id(9974),'full_name','Usman fixture'),jsonb_build_object('user_id',keu10_test.id(9975),'full_name','Tri fixture')),
    '{"hrd_ga_review":{"mode":"claim"},"fields":[]}');
