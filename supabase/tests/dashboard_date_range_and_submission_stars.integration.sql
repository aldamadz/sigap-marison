begin;
update public.surat_registrasi set created_at='2026-11-17 17:00Z' where id=public.tid(100);
update public.surat_registrasi set created_at='2026-11-18 16:59:59.999Z' where id=public.tid(101);
update public.surat_registrasi set created_at='2026-11-18 17:00Z' where id=public.tid(102);
update public.surat_registrasi set created_at='2026-11-17 18:00Z' where id=public.tid(17);
set local role authenticated;
select set_config('request.jwt.claim.sub',public.tid(1)::text,true);
select public.check_ok(
  public.get_actionable_dashboard_by_period('mine','all','2026-11-17 17:00Z','2026-11-18 17:00Z',null,1,0,true)
    @> '{"count":2,"summary":{"active":2}}', 'both WIB boundary documents count before pagination');
select public.check_ok(
  (public.get_actionable_dashboard('mine','active','2026-11-17 17:00Z','2026-11-18 17:00Z')->>'count')::int > 2,
  'legacy monthly mode keeps older active requests');
select public.check_ok(
  public.get_actionable_dashboard_by_period('team','all','2026-11-17 17:00Z','2026-11-18 17:00Z',null,12,0,true)->>'count' = '2',
  'custom range does not broaden team scope');

insert into public.surat_personal_stars(surat_id) values (public.tid(100)),(public.tid(101));
select public.check_ok(public.get_surat_monitoring_page(1,0,null,'marked')->>'count'='2','only marked, counted before paging');
select public.check_ok(public.get_surat_monitoring_page(1,1,null,'marked')->'rows'->0->>'is_starred'='true','page includes personal star');
do $$begin
  begin
    insert into public.surat_personal_stars(surat_id) values(public.tid(17));
    raise exception 'Out-of-scope star was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.surat_personal_stars(user_id,surat_id) values(public.tid(2),public.tid(100));
    raise exception 'Star assigned on behalf of another user';
  exception when insufficient_privilege then null;
  end;
end$$;
select set_config('request.jwt.claim.sub',public.tid(2)::text,true);
select public.check_ok((select count(*)=0 from public.surat_personal_stars),'second user cannot see first user stars');
select public.check_ok(public.get_surat_monitoring_page(24,0,null,'marked')->>'count'='0','second user has private count');
delete from public.surat_personal_stars where surat_id=public.tid(100);
insert into public.surat_personal_stars(surat_id) values(public.tid(100));
select public.check_ok(public.get_surat_monitoring_page(24,0,null,'marked')->>'count'='1','second user can mark independently');
select set_config('request.jwt.claim.sub',public.tid(1)::text,true);
select public.check_ok(public.get_surat_monitoring_page(24,0,null,'marked')->>'count'='2','first user marks intact');
delete from public.surat_personal_stars where surat_id=public.tid(100);
select public.check_ok(public.get_surat_monitoring_page(24,0,null,'marked')->>'count'='1','unmark does not alter documents');
select public.check_ok(not has_table_privilege('anon','public.surat_personal_stars','SELECT'),'no anonymous access');
select public.check_ok(not has_function_privilege('anon','public.get_actionable_dashboard_by_period(text,text,timestamptz,timestamptz,text,integer,integer,boolean)','EXECUTE'),'no anonymous dashboard');
rollback;
select 'Dashboard range and private stars passed';
