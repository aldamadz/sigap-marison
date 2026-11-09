begin;
alter table public.surat_registrasi disable trigger signer_action_sla_changed;
alter table public.surat_signatures disable trigger signer_action_sla_changed;
alter table public.surat_revision_events disable trigger signer_action_sla_changed;
insert into surat_registrasi(id,created_by,office_id,dept_id,status,current_step,created_at)
 values(tid(980),tid(1),tid(1),tid(1),'PROSES',2,'2026-11-02 01:00Z');
insert into surat_signatures(id,surat_id,user_id,step_order,is_signed,available_at)
 values(tid(9802),tid(980),tid(2),2,false,'2026-11-02 01:00Z'),
 (tid(9803),tid(980),tid(3),3,false,null);
select sla_clock_internal.refresh(tid(9802),'2026-11-02 01:00Z');
create function public.authority_fixture_minutes(p_at timestamptz) returns integer
 language sql as $$select sla_clock_internal.elapsed(public.tid(9802),'2026-11-02 01:00Z',p_at,
 array[1,2,3,4,5],'08:00','17:00','12:00','13:00','Asia/Jakarta')$$;
grant update on surat_registrasi to authenticated;
create policy authority_fixture_update on surat_registrasi for update to authenticated using(true) with check(true);
create function public.authority_fixture_transition(p_status text,p_step integer) returns void
 language sql security definer set search_path='' as $$
 update public.surat_registrasi set status=p_status,current_step=p_step where id=public.tid(980);
$$;
alter function public.authority_fixture_transition(text,integer) owner to postgres;
grant execute on function public.authority_fixture_transition(text,integer) to authenticated;

-- Test both a creator and the currently charged signer under the real SQL role.
do $$declare actor integer;begin
 for actor in 1..2 loop
  perform set_config('request.jwt.claim.sub',tid(actor)::text,true);
  set local role authenticated;
  perform public.check_ok((select count(*)=1 from public.surat_registrasi where id=public.tid(980)),'fixture document visible');
  begin update public.surat_registrasi set status='MENUNGGU_PERBAIKAN' where id=public.tid(980);
   raise exception 'client status update accepted';
  exception when insufficient_privilege then null;end;
  begin update public.surat_registrasi set current_step=1 where id=public.tid(980);
   raise exception 'client step rewind accepted';
  exception when insufficient_privilege then null;end;
  begin update public.surat_registrasi set current_step=3 where id=public.tid(980);
   raise exception 'client step skip accepted';
  exception when insufficient_privilege then null;end;
  begin update public.surat_registrasi set status='DONE' where id=public.tid(980);
   raise exception 'client terminal update accepted';
  exception when insufficient_privilege then null;end;
  reset role;
 end loop;
end $$;
select check_ok(sla_clock_internal.state(tid(9802))->>'phase'='ready','direct writes did not pause clock');
set local role authenticated;
select public.authority_fixture_transition('MENUNGGU_PERBAIKAN',2);
reset role;
select check_ok(sla_clock_internal.state(tid(9802))->>'phase'='ready','bare status is not pause authority');
select sla_clock_internal.refresh(tid(9802),'2026-11-02 01:10Z');
select check_ok(public.authority_fixture_minutes('2026-11-02 01:20Z')=20,'bare status does not permanently erase time');
insert into surat_revision_events(id,surat_id,status) values(tid(9809),tid(980),'awaiting_requester');
select check_ok(sla_clock_internal.state(tid(9802))->>'phase'='waiting','canonical revision pauses');
select sla_clock_internal.refresh(tid(9802),'2026-11-02 01:20Z');
select check_ok(public.authority_fixture_minutes('2026-11-02 02:00Z')=20,'canonical pause preserves charged time');
update surat_revision_events set status='resolved' where id=tid(9809);
select check_ok(sla_clock_internal.state(tid(9802))->>'phase'='ready','resolved revision resumes');
select sla_clock_internal.refresh(tid(9802),'2026-11-02 02:00Z');
set local role postgres;
update surat_registrasi set status='PROSES',current_step=3 where id=tid(980);
select check_ok(sla_clock_internal.state(tid(9802))->>'phase'='ready','overtaken unsigned stage still charges');
select sla_clock_internal.refresh(tid(9802),'2026-11-02 02:10Z');
select check_ok(public.authority_fixture_minutes('2026-11-02 02:20Z')=40,'overtaken stage retains and accrues charged time');
update surat_registrasi set current_step=2 where id=tid(980);
select check_ok(sla_clock_internal.state(tid(9803))->>'phase'='upcoming','genuinely future stage not charged');
select check_ok(not has_function_privilege('authenticated','sla_clock_internal.state(uuid,timestamptz)','execute'),'private state remains private');
rollback;
select 'SLA03 lifecycle authority assertions passed';
