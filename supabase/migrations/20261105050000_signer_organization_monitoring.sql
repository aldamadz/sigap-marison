begin;

-- This additional scope exposes progress only, never document RLS or mutations.
create or replace function public.can_monitor_surat_progress(p_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.can_monitor_surat_scope(p_surat_id) or exists (
  select 1 from public.profiles actor
  join public.master_offices actor_office on actor_office.id=actor.office_id
  join public.surat_signatures signature on signature.surat_id=p_surat_id
  join public.profiles signer on signer.id=signature.user_id
    and signer.is_active is true and signer.deleted_at is null
  join public.master_offices signer_office on signer_office.id=signer.office_id
  where actor.id=auth.uid() and actor.is_active is true and actor.deleted_at is null
   and (
    (actor_office.kedudukan='Pusat' and signer_office.kedudukan='Pusat'
      and actor.department_id is not null and signer.department_id=actor.department_id)
    or (actor_office.kedudukan in ('KC','KCP') and signer_office.kedudukan<>'Pusat'
      and signer.office_id in (select public.dashboard_organization_offices()))
   )
 );
$$;
revoke all on function public.can_monitor_surat_progress(uuid) from public,anon;
grant execute on function public.can_monitor_surat_progress(uuid) to authenticated,service_role;

do $migration$
declare
 identity text;
 definition text;
 old_scope text := 'public.can_monitor_surat_scope(surat.id)';
 new_scope text := 'public.can_monitor_surat_progress(surat.id)';
 old_team text := E'(a.kedudukan in (''KC'',''KCP'') and o.kedudukan<>''Pusat'' and s.office_id in(select id from offices))) as is_team';
 new_team text := E'(a.kedudukan in (''KC'',''KCP'') and o.kedudukan<>''Pusat'' and s.office_id in(select id from offices))\n    or public.can_monitor_surat_progress(s.id)) as is_team';
 old_filter text := E'or (a.kedudukan in (''KC'',''KCP'') and o.kedudukan<>''Pusat'' and s.office_id in(select id from offices))\n ), selected as (';
 new_filter text := E'or (a.kedudukan in (''KC'',''KCP'') and o.kedudukan<>''Pusat'' and s.office_id in(select id from offices))\n   or public.can_monitor_surat_progress(s.id)\n ), selected as (';
 safe_signature text := $safe$case when public.can_read_surat(surat.id) then to_jsonb(signature)
   else jsonb_build_object('id',signature.id,'user_id',signature.user_id,
    'step_order',signature.step_order,'is_signed',signature.is_signed,'status',signature.status,
    'role_name',signature.role_name,'label_jabatan',signature.label_jabatan,
    'signed_at',signature.signed_at,'catatan',signature.catatan) end$safe$;
begin
 foreach identity in array array[
  'public.get_surat_monitoring_page(integer,integer,text,text,timestamptz,timestamptz)',
  'public.get_surat_monitoring_detail(uuid)',
  'public.get_my_surat_monitoring_stats(timestamptz,timestamptz)'
 ] loop
  definition := pg_get_functiondef(identity::regprocedure);
  if position(new_scope in definition)=0 then
   if position(old_scope in definition)=0 then
    raise exception 'Unknown monitoring implementation: %',identity;
   end if;
   definition := replace(definition,old_scope,new_scope);
   if identity='public.get_surat_monitoring_detail(uuid)' then
    if position('to_jsonb(signature)' in definition)=0 then
     raise exception 'Unknown monitoring signature detail shape';
    end if;
    definition := replace(definition,'to_jsonb(signature)',safe_signature);
   end if;
   execute definition;
  end if;
 end loop;
 definition := replace(pg_get_functiondef('public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure),E'\r\n',E'\n');
 if position('can_monitor_surat_progress' in definition)=0 then
  if position(old_team in definition)=0 or position(old_filter in definition)=0 then
   raise exception 'Unknown dashboard team scope; audit before applying';
  end if;
  if position('''id'',id,''no_surat'',no_surat' in definition)=0 then
   raise exception 'Unknown dashboard row identity';
  end if;
  execute replace(replace(replace(definition,old_team,new_team),old_filter,new_filter),
   '''id'',id,''no_surat'',no_surat',
   '''can_remind'',public.can_monitor_surat_scope(id),''id'',id,''no_surat'',no_surat');
 end if;
end;
$migration$;

revoke all on function public.get_surat_monitoring_page(integer,integer,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.get_surat_monitoring_detail(uuid) from public,anon;
revoke all on function public.get_my_surat_monitoring_stats(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_surat_monitoring_page(integer,integer,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.get_surat_monitoring_detail(uuid) to authenticated;
grant execute on function public.get_my_surat_monitoring_stats(timestamptz,timestamptz) to authenticated;

notify pgrst,'reload schema';
commit;
