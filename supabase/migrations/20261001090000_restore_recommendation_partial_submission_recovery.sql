-- REC-01/SUR-02: restore canonical partial-submission recovery in all environments.
-- No reservation or business row is rewritten; retry keeps the committed child.
-- Delegate fresh registration to the current core, preserving MAR-10 validation.
begin;

create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_draft_id uuid := nullif(p_payload->>'draft_id', '')::uuid;
  v_payload_reservation_id uuid := nullif(p_payload->>'reservation_id', '')::uuid;
  v_draft_reservation_id uuid;
  v_reservation_status text;
  v_existing public.surat_registrasi%rowtype;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia. Silakan login ulang.' using errcode = '28000';
  end if;

  if v_draft_id is not null then
    select draft.reservation_id
    into v_draft_reservation_id
    from public.surat_registration_drafts as draft
    where draft.id = v_draft_id
      and draft.created_by = v_actor
      and draft.no_surat = nullif(p_payload->>'no_surat', '')
      and draft.status in ('DRAFT', 'SUBMITTED')
    for update;

    if v_draft_reservation_id is not null
       and v_payload_reservation_id is distinct from v_draft_reservation_id then
      raise exception 'Reservasi draft tidak sesuai dengan payload.' using errcode = '22023';
    end if;
  end if;

  if v_draft_reservation_id is not null then
    select reservation.status::text
    into v_reservation_status
    from public.surat_reservations as reservation
    where reservation.id = v_draft_reservation_id
      and reservation.reserved_by = v_actor
    for update;

    if v_reservation_status = 'USED' then
      select surat.*
      into v_existing
      from public.surat_registrasi as surat
      where surat.no_surat = nullif(p_payload->>'no_surat', '')
        and surat.created_by = v_actor
      order by surat.id
      limit 1;

      if found then
        return v_existing;
      end if;

      raise exception 'Reservasi sudah digunakan tetapi surat hasilnya tidak ditemukan.' using errcode = '55000';
    end if;
  end if;

  return public.create_surat_registrasi_core(p_payload, v_actor);
end;
$$;

revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;

create or replace function public.complete_recommendation_task(p_task_id uuid, p_child_surat_id uuid)
returns public.surat_recommendation_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_task public.surat_recommendation_tasks;
  v_child public.surat_registrasi%rowtype;
  v_input jsonb;
  v_items jsonb;
  v_context_task text;
  v_child_reservation text;
  v_parent jsonb;
  v_status text;
  v_rejected integer := 0;
  v_total integer := 0;
  v_now timestamptz;
  v_affected integer;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.is_active is true) then
    raise exception 'Profil aktif tidak tersedia.' using errcode='42501';
  end if;
  select exists (
    select 1 from public.profiles p where p.id = v_actor
      and p.role::text in ('admin', 'super_admin') and p.is_active is true
  ) into v_is_admin;
  select * into v_task from public.surat_recommendation_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas rekomendasi tidak ditemukan.' using errcode = 'P0002'; end if;
  if not (v_task.claimed_by = v_actor or v_is_admin) then
    raise exception 'Tugas rekomendasi dikunci user lain.' using errcode = '42501';
  end if;
  if v_task.status = 'submitted' then
    if v_task.submitted_surat_id = p_child_surat_id then return v_task; end if;
    raise exception 'Tugas rekomendasi sudah diselesaikan dengan surat lain.' using errcode = '55000';
  end if;
  if v_task.status not in ('claimed', 'revision_requested') then
    raise exception 'Tugas rekomendasi belum dapat diselesaikan dari status %.', v_task.status using errcode = '55000';
  end if;
  select * into v_child from public.surat_registrasi c
  where c.id = p_child_surat_id and (c.created_by = v_actor or v_is_admin);
  if not found then raise exception 'Surat rekomendasi tidak valid.' using errcode = '42501'; end if;

  v_input := coalesce(v_child.form_input_data, '{}'::jsonb);
  if lower(coalesce(v_input->>'linked_document_type', '')) <> 'recommendation'
     or nullif(v_input->>'linked_parent_surat_id', '') is distinct from v_task.parent_surat_id::text then
    raise exception 'Surat child bukan rekomendasi untuk parent tugas ini.' using errcode = '22023';
  end if;
  v_context_task := nullif(coalesce(v_input->>'task_id', v_input->>'recommendation_task_id', v_input#>>'{linked_context,task_id}'), '');

  select draft.reservation_id::text
  into v_child_reservation
  from public.surat_registration_drafts as draft
  where draft.reservation_id = v_task.reservation_id
    and draft.created_by = v_child.created_by
    and draft.no_surat = v_child.no_surat
    and draft.status in ('DRAFT', 'SUBMITTED')
  order by draft.updated_at desc, draft.id
  limit 1;

  if v_context_task is not null and v_context_task <> p_task_id::text then
    raise exception 'Task context child tidak sesuai.' using errcode = '22023';
  end if;
  if v_child_reservation is distinct from v_task.reservation_id::text then
    raise exception 'Child tidak terikat pada reservation tugas.' using errcode = '22023';
  end if;

  if v_input ? 'recommendation_multi_detail' then
    if jsonb_typeof(v_input->'recommendation_multi_detail') <> 'object'
       or jsonb_typeof(v_input#>'{recommendation_multi_detail,version}') <> 'number'
       or (v_input#>>'{recommendation_multi_detail,version}')::numeric <> 1
       or not ((v_input->'recommendation_multi_detail') ? 'items') then
      raise exception 'Payload recommendation_multi_detail canonical tidak valid.' using errcode = '22023';
    end if;
    v_items := v_input#>'{recommendation_multi_detail,items}';
    perform public.validate_recommendation_items(v_items,true);
  else
    v_items := v_input->'recommendation_items';
    perform public.validate_recommendation_items(v_items,false);
  end if;
  for v_parent in select value from jsonb_array_elements(v_items)
  loop
    v_total := v_total + 1;
    v_status := regexp_replace(lower(btrim(coalesce(v_parent->>'status', v_parent->>'recommendation_status', v_parent->>'recommendation_action', ''))),'[[:space:]_-]+','_','g');
    if v_status in ('not_recommended', 'tidak_direkomendasikan', 'rejected', 'ditolak')
       or lower(coalesce(v_parent->>'is_recommended', 'true')) = 'false' then
      v_rejected := v_rejected + 1;
    end if;
  end loop;
  v_now := clock_timestamp();
  update public.surat_linked_documents set status = 'cancelled', updated_at = v_now
  where parent_surat_id = v_task.parent_surat_id and link_type = 'recommendation'
    and status = 'active' and child_surat_id <> p_child_surat_id;
  insert into public.surat_linked_documents(parent_surat_id, child_surat_id, link_type, required_before_step, created_by)
  values(v_task.parent_surat_id, p_child_surat_id, 'recommendation', v_task.required_before_step, v_actor)
  on conflict(parent_surat_id, child_surat_id, link_type) do update
  set status = 'active', required_before_step = excluded.required_before_step, updated_at = v_now;
  update public.surat_reservations set status = 'USED', reserved_by = coalesce(reserved_by, v_actor)
  where id = v_task.reservation_id and status in ('PENDING', 'USED');
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'Reservation tugas tidak tersedia atau tidak dapat digunakan.' using errcode='55000'; end if;
  update public.surat_recommendation_tasks
  set status = 'submitted', submitted_surat_id = p_child_surat_id, submitted_at = v_now
  where id = p_task_id returning * into v_task;
  return v_task;
end;
$$;

revoke all on function public.complete_recommendation_task(uuid,uuid) from public,anon;
grant execute on function public.complete_recommendation_task(uuid,uuid) to authenticated,service_role;


notify pgrst, 'reload schema';
commit;
