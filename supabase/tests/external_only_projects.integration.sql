do $$
begin
  if public.is_external_master_project('10000000-0000-4000-8000-000000000001') then
    raise exception 'Local history accepted as active project'; end if;
  if not public.is_external_master_project('10000000-0000-4000-8000-000000000002') then
    raise exception 'Real API project rejected'; end if;
  if not exists(select 1 from public.master_projects where id='10000000-0000-4000-8000-000000000001'
    and name='Local history' and local_retired_at is not null) then
    raise exception 'Historical project removed or altered'; end if;
end $$;

-- ACL applies even to an authenticated admin bypassing the UI.
set role authenticated;
do $$
begin
  begin
    insert into public.master_projects(id,name) values(gen_random_uuid(),'Fake');
    raise exception 'Manual insert unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.master_projects set name='Fake' where id='10000000-0000-4000-8000-000000000002';
    raise exception 'Identity update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.master_projects where id='10000000-0000-4000-8000-000000000002';
    raise exception 'Manual delete unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  update public.master_projects set entity_id=null where id='10000000-0000-4000-8000-000000000002';
  begin
    update public.master_projects set entity_id=null where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Retired project edit unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Even privileged RPCs cannot reserve/submit a local project as a new identity.
do $$
declare v_entity uuid; v_office uuid; v_dept uuid; v_project uuid;
begin
  select id into v_entity from public.master_entities limit 1;
  select id into v_office from public.master_offices where kedudukan<>'Pusat' limit 1;
  select id into v_dept from public.master_departments limit 1;
  begin
    insert into public.surat_reservations(entity_id,office_id,project_id,year,no_urut,number_scope_type)
    values(v_entity,v_office,'10000000-0000-4000-8000-000000000001',2026,900,'cabang');
    raise exception 'Local number allocation unexpectedly allowed';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.surat_registrasi(project_id) values('10000000-0000-4000-8000-000000000001');
    raise exception 'Local registration unexpectedly allowed';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.letter_number_counter_configs(scope_type,entity_id,project_id,year)
    values('cabang',v_entity,'10000000-0000-4000-8000-000000000001',2026);
    raise exception 'Local counter unexpectedly allowed';
  exception when invalid_parameter_value then null; end;
  -- API source still writable by the trusted sync role, and activates only genuine synced identity.
  grant insert,update,select on public.master_projects to service_role;
end $$;
set role service_role;
insert into public.master_projects(id,name,marison_project_id,marison_synced_at)
values('10000000-0000-4000-8000-000000000003','New API project',1000,now());
reset role;
do $$ begin
  if not public.is_external_master_project('10000000-0000-4000-8000-000000000003') then
    raise exception 'API sync role unable to create active project'; end if;
  raise notice 'External-only projects: all assertions passed';
end $$;
