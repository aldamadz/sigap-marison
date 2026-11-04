-- Behavioral single-account proof for split [UJI STAGING PUSAT/CABANG] clones.
-- Disposable DB / rollback only. No real staging letters, no vendor POST.
-- Real validate_form_usage_signature trigger + is_inbox_task_active predicate.
-- Full handle_approve/verify RPCs are NOT executed here; closest
-- characterization is signer init + active-task predicate + sequential
-- current_step progression. Runtime approval acceptance on staging remains
-- required after migration.
do $$
declare
  v_pusat uuid;
  v_cabang uuid;
  v_usage record;
  v_tester uuid;
  v_src_id uuid;
  v_reg uuid;
  v_sig uuid;
  v_step record;
  v_office uuid;
  v_max_step integer;
  v_cur integer;
begin
  select id into v_pusat from public.profiles
  where email='system.tuyemaris@gmail.com' limit 1;
  select id into v_cabang from public.profiles
  where email='faizalsyahiddin@gmail.com' limit 1;
  if v_pusat is null or v_cabang is null then
    raise exception 'behavioral: testers missing';
  end if;

  for v_usage in select * from public.form_usages
    where status='active'
      and (name like '[UJI STAGING]%' or name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%')
    order by name loop
    if v_usage.name like '[UJI STAGING CABANG]%' then
      v_tester := v_cabang;
    else
      -- Legacy single-account clones and PUSAT clones resolve to the Pusat tester.
      v_tester := v_pusat;
    end if;

    if v_usage.scope_type='cabang' then
      select id into v_office from public.master_offices where name='Cabang A' limit 1;
    else
      select office_id into v_office from public.profiles where id=v_tester;
    end if;

    insert into public.surat_registrasi (form_usage_id, office_id, dept_id, created_by, status, current_step, form_input_data, data_snapshot)
    values (v_usage.id, v_office,
      (select department_id from public.form_usage_departments where usage_id=v_usage.id limit 1),
      v_tester, 'PROSES', 1, '{}'::jsonb, '{}'::jsonb)
    returning id into v_reg;

    -- Init all signers with the scope tester; requester links to creator.
    for v_step in select * from public.form_usage_steps where usage_id=v_usage.id order by step_order loop
      insert into public.surat_signatures (surat_id, user_id, form_usage_step_id)
      values (v_reg, v_tester, v_step.id)
      returning id into v_sig;
      if v_step.assignee_mode='requester' and not exists (
        select 1 from public.surat_signatures s join public.surat_registrasi r on r.id=s.surat_id
        where s.id=v_sig and s.user_id=r.created_by) then
        raise exception 'behavioral % step % requester not creator', v_usage.name, v_step.step_order;
      end if;
      if v_step.action_type='unit_allocation' and not exists (
        select 1 from public.surat_signatures where id=v_sig and requires_unit_allocation is true) then
        raise exception 'behavioral % unit_allocation flag lost', v_usage.name;
      end if;
      if v_step.action_type='configured_input' then
        if not exists (select 1 from public.surat_signatures where id=v_sig
          and input_schema_snapshot ? 'fields') then
          raise exception 'behavioral % checker schema lost', v_usage.name;
        end if;
        if not exists (select 1 from public.surat_signatures where id=v_sig
          and verification_required is true) then
          raise exception 'behavioral % checker operator missing', v_usage.name;
        end if;
        if not public.is_valid_checker_input_schema(
          (select input_schema_snapshot from public.surat_signatures where id=v_sig)) then
          raise exception 'behavioral % checker schema invalid', v_usage.name;
        end if;
      end if;
    end loop;

    select max(step_order) into v_max_step from public.surat_signatures where surat_id=v_reg;
    if exists (select 1 from public.surat_signatures where surat_id=v_reg and user_id<>v_tester) then
      raise exception 'behavioral % needs other signer', v_usage.name;
    end if;
    -- Cross-scope tester must never appear.
    if (v_usage.name like '[UJI STAGING PUSAT]%' or v_usage.name like '[UJI STAGING]%')
       and not (v_usage.name like '[UJI STAGING CABANG]%')
       and exists (select 1 from public.surat_signatures where surat_id=v_reg and user_id=v_cabang) then
      raise exception 'behavioral % leaks Cabang tester', v_usage.name;
    end if;
    if v_usage.name like '[UJI STAGING CABANG]%'
       and exists (select 1 from public.surat_signatures where surat_id=v_reg and user_id=v_pusat) then
      raise exception 'behavioral % leaks Pusat tester', v_usage.name;
    end if;

    -- Sequential completion; next step re-enters the same tester inbox.
    for v_cur in 1..v_max_step loop
      update public.surat_registrasi set current_step=v_cur where id=v_reg;
      select id into v_sig from public.surat_signatures
      where surat_id=v_reg and step_order=v_cur limit 1;
      if not public.is_inbox_task_active(v_tester, v_sig) then
        raise exception 'behavioral % step % not active for tester', v_usage.name, v_cur;
      end if;
      update public.surat_signatures
      set verification_status='verified', verified_at=now(), verified_by=v_tester
      where id=v_sig and verification_required is true;
      update public.surat_signatures set is_signed=true where id=v_sig;
      if v_cur < v_max_step then
        update public.surat_registrasi set current_step=v_cur+1 where id=v_reg;
        select id into v_sig from public.surat_signatures
        where surat_id=v_reg and step_order=v_cur+1 limit 1;
        if not public.is_inbox_task_active(v_tester, v_sig) then
          raise exception 'behavioral % next step % not re-entered tester inbox', v_usage.name, v_cur+1;
        end if;
      end if;
    end loop;
    update public.surat_registrasi set status='SELESAI' where id=v_reg;
    if exists (select 1 from public.surat_signatures where surat_id=v_reg and is_signed is not true) then
      raise exception 'behavioral % not all steps completable', v_usage.name;
    end if;

    -- Internal template keeps its steps and never re-requests creator files.
    if v_usage.name like '%Rekomendasi Peremajaan Aset' then
      if (select count(*) from public.surat_signatures where surat_id=v_reg)
        <> (select count(*) from public.form_usage_steps where usage_id=v_usage.id) then
        raise exception 'behavioral rec clone step init incomplete for %', v_usage.name;
      end if;
      if exists (select 1 from public.form_usage_attachment_requirements
        where usage_id=v_usage.id and stage_order=1) then
        raise exception 'behavioral % re-requests creator attachment', v_usage.name;
      end if;
    end if;

    delete from public.surat_signatures where surat_id=v_reg;
    delete from public.surat_registrasi where id=v_reg;
  end loop;

  raise notice 'SPLIT single-account behavioral: all assertions passed';
end $$;
