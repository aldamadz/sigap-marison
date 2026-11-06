begin;
create function public.cal10_id(n integer) returns uuid language sql immutable as $$
 select ('ca100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function public.cal10_check(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'CAL10: %',message;end if;end $$;

insert into public.master_offices(id,name,kedudukan,parent_id) values
 (cal10_id(100),'Pusat','Pusat',null),(cal10_id(101),'KC Solo','KC',null),
 (cal10_id(102),'KCP Karanganyar','KCP',cal10_id(101)),
 (cal10_id(103),'KCP Sragen','KCP',cal10_id(101)),
 (cal10_id(104),'KC Lain','KC',null);
insert into public.master_departments(id,name) values(cal10_id(201),'PO'),(cal10_id(202),'Keuangan');
insert into public.profiles(id,full_name,office_id,department_id,parent_id,is_active) values
 (cal10_id(1),'Pusat staf',cal10_id(100),cal10_id(201),null,true),
 (cal10_id(2),'Pusat rekan',cal10_id(100),cal10_id(201),null,true),
 (cal10_id(3),'Pusat lain',cal10_id(100),cal10_id(202),null,true),
 (cal10_id(4),'KC staf',cal10_id(101),cal10_id(201),null,true),
 (cal10_id(5),'KC rekan',cal10_id(101),cal10_id(202),null,true),
 (cal10_id(6),'KCP rekan',cal10_id(102),cal10_id(201),null,true),
 (cal10_id(7),'KCP rekan dua',cal10_id(102),cal10_id(202),null,true),
 (cal10_id(8),'KCP saudara',cal10_id(103),cal10_id(201),null,true),
 (cal10_id(9),'KC luar',cal10_id(104),cal10_id(201),null,true),
 (cal10_id(10),'Nonaktif',cal10_id(101),cal10_id(201),null,false),
 (cal10_id(11),'Atasan lama',null,null,null,true),
 (cal10_id(12),'Bawahan lama',cal10_id(104),cal10_id(202),cal10_id(11),true);
insert into public.work_calendar_entries(id,owner_id,work_date,title) select cal10_id(300+n),cal10_id(n),'2026-11-05','Pekerjaan '||n
 from generate_series(1,12) n;

select set_config('request.jwt.claim.sub',cal10_id(1)::text,true);
set local role authenticated;
select cal10_check(has_work_calendar_team_members(),'staf Pusat dapat membuka Tim');
select cal10_check((select count(*)=1 from list_work_calendar_team_members()),'Pusat hanya departemen yang sama');
select cal10_check((select count(*)=1 from search_work_calendar_team_members(null,25,0,null,null)),'pencarian konsisten');
select cal10_check((select count(*)=1 from list_work_calendar_team_entries('2026-11-05','2026-11-05')),'daftar dan ekspor konsisten');
select cal10_check((select count(*)=1 from list_work_calendar_member_entries(cal10_id(2),'2026-11-05')),'detail rekan');
select cal10_check((select count(*)=0 from list_work_calendar_member_entries(cal10_id(3),'2026-11-05')),'detail departemen lain ditolak');
select cal10_check((select count(*)=0 from get_work_calendar_team_member(cal10_id(9))),'profil kantor lain tidak bocor');
select cal10_check((select count(*)=1 from list_work_calendar_team_overview(null,null,null,null,null,'2026-11-05','priority',25,0)),'agregat satu scope');
select cal10_check(exists(select 1 from work_calendar_events where owner_id=cal10_id(2)),'riwayat rekan dapat dibaca');
select cal10_check(not exists(select 1 from work_calendar_events where owner_id=cal10_id(3)),'riwayat asing tertutup');
do $$declare n integer;begin
 update public.work_calendar_entries set title='Tidak boleh' where id=cal10_id(302);
 get diagnostics n=row_count;perform cal10_check(n=0,'rekan tidak dapat mengubah pekerjaan');
 perform cal10_check(not public.soft_delete_work_calendar_entry(cal10_id(302),(select updated_at from work_calendar_entries where id=cal10_id(302))),
  'rekan tidak dapat menghapus pekerjaan');
end $$;
reset role;

select set_config('request.jwt.claim.sub',cal10_id(4)::text,true);set local role authenticated;
select cal10_check((select count(*)=4 from list_work_calendar_team_members()),'KC: sesama kantor dan KCP di bawahnya');
select cal10_check(not exists(select 1 from work_calendar_visible_members() where member_id in(cal10_id(1),cal10_id(9),cal10_id(10))),'bukan Pusat/KC luar/nonaktif');
select set_config('request.jwt.claim.sub',cal10_id(6)::text,true);
select cal10_check((select count(*)=1 from list_work_calendar_team_members()),'KCP: kantor sendiri bukan induk atau saudara');
reset role;
update profiles set office_id=cal10_id(104) where id=cal10_id(7);
select set_config('request.jwt.claim.sub',cal10_id(6)::text,true);set local role authenticated;
select cal10_check(not has_work_calendar_team_members(),'perpindahan kantor langsung memperbarui akses');
select set_config('request.jwt.claim.sub',cal10_id(11)::text,true);
select cal10_check((select count(*)=1 from work_calendar_visible_members()),'hierarki lama tetap tersedia');
reset role;
update profiles set deleted_at=now() where id=cal10_id(1);
select set_config('request.jwt.claim.sub',cal10_id(1)::text,true);set local role authenticated;
select cal10_check(not has_work_calendar_team_members(),'aktor terhapus ditolak');
reset role;
select cal10_check(not has_function_privilege('anon','public.work_calendar_visible_members()','execute'),'anon tidak memiliki akses');
select 'CAL-10 organization scope: all assertions passed';
rollback;
