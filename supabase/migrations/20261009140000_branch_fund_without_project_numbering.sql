begin;

-- Dana Umum has a separate immutable scope, sharing the existing office-wide
-- no-project counter/lock with KEU 1 and Asset fallback to prevent collisions.
alter table public.surat_reservations drop constraint if exists surat_reservations_number_scope_type_check;
alter table public.surat_reservations add constraint surat_reservations_number_scope_type_check
  check(number_scope_type in ('pusat','cabang','branch_asset_000','branch_keu1_000','branch_fund_general'));

drop policy if exists "Prevent direct branch_asset_000 insert" on public.surat_reservations;
create policy "Prevent direct branch_asset_000 insert" on public.surat_reservations
  as restrictive for insert to authenticated
  with check(number_scope_type not in ('branch_asset_000','branch_keu1_000','branch_fund_general'));

-- Preserve the deployed canonical allocator's actor, department, type, active
-- usage, server-time reuse and audit guards. Fail if the expected source drifts.
do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.generate_keu1_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
  v_old text := $old$and usage.scope_type = 'cabang' and upper(trim(form.nomor_form)) = 'FM-UAI.KEU-01-00'$old$;
begin
  if position(v_old in v_definition)=0
    or position('public.claim_reusable_letter_number(' in v_definition)=0
    or position('validate_form_usage_for_actor(p_form_usage_id, p_dept_id)' in v_definition)=0
    or position('pg_advisory_xact_lock' in v_definition)=0 then
    raise exception 'Unknown branch allocator; review before applying.';
  end if;
  v_definition := replace(v_definition,'public.generate_keu1_branch_letter_number(', 'public.generate_fund_branch_letter_number(');
  v_definition := replace(v_definition,v_old,$new$and usage.scope_type in ('cabang','all')
      and upper(trim(form.nomor_form)) ~ '(^|[.-])PGD([.-]|$)'$new$);
  v_definition := replace(v_definition,'''branch_keu1_000''','''branch_fund_general''');
  v_definition := replace(v_definition,'KEU 1','Dana Umum');
  execute v_definition;
end $patch$;
revoke all on function public.generate_fund_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.generate_fund_branch_letter_number(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;

do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.enforce_surat_reservation_number_scope()'::regprocedure),E'\r\n',E'\n');
begin
  if position('''branch_fund_general''' in v_definition)=0 then
    if position('''branch_asset_000'', ''branch_keu1_000''' in v_definition)=0
      or position('new.number_scope_type = ''branch_keu1_000''' in v_definition)=0 then
      raise exception 'Unknown reservation scope guard; review before applying.';
    end if;
    v_definition := replace(v_definition,'''branch_asset_000'', ''branch_keu1_000''', '''branch_asset_000'', ''branch_keu1_000'', ''branch_fund_general''');
    v_definition := replace(v_definition,'new.number_scope_type = ''branch_keu1_000''',
      'new.number_scope_type in (''branch_keu1_000'', ''branch_fund_general'')');
    execute v_definition;
  end if;
end $patch$;

-- Registration requires a genuine PGD Fund usage, explicit no-project intent,
-- and a reservation of the matching scope/actor/entity/office/type/year/number.
-- It cannot consume a KEU 1 reservation or bypass SPK/KEU 10 project guards.
do $patch$
declare
  v_definition text := replace(pg_get_functiondef('public.enforce_surat_registration_branch_project()'::regprocedure),E'\r\n',E'\n');
begin
  if position('v_is_general_fund' in v_definition)=0 then
    if position('v_is_keu1 boolean;' in v_definition)=0
      or position('      if v_is_keu1 then' in v_definition)=0
      or position('reservation.number_scope_type = ''branch_keu1_000''' in v_definition)=0
      or position('split_part(new.no_surat, ''/'', 1)' in v_definition)=0 then
      raise exception 'Unknown registration project guard; review before applying.';
    end if;
    v_definition := replace(v_definition,'v_is_keu1 boolean;', 'v_is_keu1 boolean; v_is_general_fund boolean;');
    v_definition := replace(v_definition,'v_is_keu1 := coalesce(v_is_keu1, false);', $body$v_is_keu1 := coalesce(v_is_keu1, false);
  select exists(select 1 from public.form_usages usage
    join public.master_forms form on form.id=usage.form_id
    where usage.id=new.form_usage_id and usage.request_category='non_asset'
      and usage.scope_type in ('cabang','all')
      and upper(trim(form.nomor_form)) ~ '(^|[.-])PGD([.-]|$)') into v_is_general_fund;
  if v_is_general_fund and new.project_id is not null
    and v_marker->>'fund_without_project'='true' then
    raise exception 'Dana Umum tanpa proyek tidak boleh menyertakan proyek.' using errcode='22023';
  end if;$body$);
    v_definition := replace(v_definition,'      if v_is_keu1 then','      if v_is_keu1 or v_is_general_fund then');
    v_definition := replace(v_definition,'reservation.number_scope_type = ''branch_keu1_000''',
      'reservation.number_scope_type = case when v_is_keu1 then ''branch_keu1_000'' else ''branch_fund_general'' end');
    v_definition := replace(v_definition,'Reservasi KEU 1 cabang tanpa proyek tidak valid.',
      'Reservasi pengajuan cabang tanpa proyek tidak valid.');
    execute v_definition;
  end if;
end $patch$;

notify pgrst,'reload schema';
commit;
