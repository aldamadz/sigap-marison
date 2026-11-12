begin;

alter table public.form_usages drop constraint if exists form_usages_request_category_check;
alter table public.form_usages add constraint form_usages_request_category_check
  check(request_category in ('asset','unit','non_unit','non_asset','goods'));

-- Extend only audited canonical category/project validators, not outbound builders.
do $category$
declare item record; definition text;
begin
  for item in select oid from pg_proc where pronamespace='public'::regnamespace
    and proname in ('create_surat_registrasi_core','assert_branch_asset_fallback_eligible','enforce_surat_registration_branch_project')
  loop
    definition:=pg_get_functiondef(item.oid);
    definition:=replace(definition,'''asset'', ''unit'', ''non_unit'', ''non_asset''', '''asset'', ''unit'', ''non_unit'', ''non_asset'', ''goods''');
    definition:=replace(definition,'v_category is distinct from ''asset''','v_category not in (''asset'',''goods'')');
    definition:=replace(definition,'v_usage_validation->>''request_category'' is distinct from ''asset''',
      '(v_usage_validation->>''request_category'') not in (''asset'',''goods'')');
    execute definition;
  end loop;
end $category$;

-- Internal destination derives from the configured usage, not editable JSON.
do $route$
declare definition text;
begin
  if to_regprocedure('public.marison_procurement_routing_block(uuid)') is not null then
    definition:=pg_get_functiondef('public.marison_procurement_routing_block(uuid)'::regprocedure);
    if position('''internal_goods''' in definition)=0 then
      if position('when exists(select 1 from identities' in definition)=0 then raise exception 'Unknown procurement boundary'; end if;
      definition:=replace(definition,'select case',
        'select case when exists(select 1 from public.surat_registrasi sr join public.form_usages u on u.id=sr.form_usage_id where sr.id=p_surat_id and u.request_category=''goods'') then ''internal_goods''');
      execute definition;
    end if;
  end if;
end $route$;

-- Operator-only cloning preserves scope, departments, role order and candidates.
create or replace function hrd_ga_review_internal.clone_goods(p_source uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.form_usages; new_id uuid; row_data jsonb; stage record; new_step uuid; item record;
begin
  select * into strict source from public.form_usages where id=p_source and status='active' and request_category='asset';
  if not exists(select 1 from public.master_forms f where f.id=source.form_id and upper(trim(f.nomor_form)) ~ '(^|[.-])PGD([.-]|$)')
    or not exists(select 1 from public.form_usage_steps s where s.usage_id=source.id and s.input_schema#>>'{hrd_ga_review,mode}'='claim') then
    raise exception 'Sumber kegunaan barang internal tidak valid.'; end if;
  new_id:=md5('hrd-ga-internal-goods:'||source.id::text)::uuid;
  if exists(select 1 from public.form_usages where id=new_id) then return new_id; end if;
  row_data:=to_jsonb(source)||jsonb_build_object('id',new_id,'request_category','goods','status','draft',
    'name',replace(source.name,'Pengajuan Aset','Permintaan Barang dari Stok GA'),
    'description','Map & Form, ATK, dan kebutuhan rumah tangga dari stok GA. Tanpa pencairan dana; internal SIGAP. Pembelian stok memakai Pengajuan Dana Operasional yang sudah ada.',
    'recommendation_config','{}'::jsonb,'created_at',now(),'updated_at',now());
  insert into public.form_usages select (jsonb_populate_record(null::public.form_usages,row_data)).*;
  insert into public.form_usage_departments select (jsonb_populate_record(null::public.form_usage_departments,
    to_jsonb(d)||jsonb_build_object('usage_id',new_id))).* from public.form_usage_departments d where usage_id=source.id;
  for stage in select * from public.form_usage_steps where usage_id=source.id order by step_order loop
    new_step:=md5(new_id::text||':'||stage.id::text)::uuid;
    insert into public.form_usage_steps select (jsonb_populate_record(null::public.form_usage_steps,
      to_jsonb(stage)||jsonb_build_object('id',new_step,'usage_id',new_id))).*;
    for item in select * from public.form_usage_step_users where usage_step_id=stage.id loop
      insert into public.form_usage_step_users select (jsonb_populate_record(null::public.form_usage_step_users,
        to_jsonb(item)||jsonb_build_object('usage_step_id',new_step))).*;
    end loop;
    for item in select * from public.form_usage_step_verifiers where usage_step_id=stage.id loop
      insert into public.form_usage_step_verifiers select (jsonb_populate_record(null::public.form_usage_step_verifiers,
        to_jsonb(item)||jsonb_build_object('usage_step_id',new_step))).*;
    end loop;
  end loop;
  for item in select * from public.form_usage_attachment_requirements where usage_id=source.id loop
    insert into public.form_usage_attachment_requirements select (jsonb_populate_record(null::public.form_usage_attachment_requirements,
      to_jsonb(item)||jsonb_build_object('id',md5(new_id::text||':'||item.id::text)::uuid,'usage_id',new_id,
        'usage_step_id',case when item.usage_step_id is null then null else md5(new_id::text||':'||item.usage_step_id::text)::uuid end))).*;
  end loop;
  return new_id;
end $$;
revoke all on function hrd_ga_review_internal.clone_goods(uuid) from public,anon,authenticated,service_role;
alter function hrd_ga_review_internal.clone_goods(uuid) owner to postgres;
notify pgrst,'reload schema';
commit;
