create table if not exists public.form_usage_step_verifiers (
  usage_step_id uuid not null references public.form_usage_steps(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usage_step_id, user_id)
);

create index if not exists form_usage_step_verifiers_user_idx
  on public.form_usage_step_verifiers(user_id, usage_step_id);

alter table public.form_usage_step_verifiers enable row level security;

drop policy if exists form_usage_step_verifiers_read_authenticated on public.form_usage_step_verifiers;
create policy form_usage_step_verifiers_read_authenticated
on public.form_usage_step_verifiers for select to authenticated
using (
  public.is_current_user_admin()
  or public.can_read_form_usage((
    select step.usage_id
    from public.form_usage_steps step
    where step.id = form_usage_step_verifiers.usage_step_id
  ))
);

drop policy if exists form_usage_step_verifiers_admin_insert on public.form_usage_step_verifiers;
create policy form_usage_step_verifiers_admin_insert
on public.form_usage_step_verifiers for insert to authenticated
with check (public.is_current_user_admin());

drop policy if exists form_usage_step_verifiers_admin_update on public.form_usage_step_verifiers;
create policy form_usage_step_verifiers_admin_update
on public.form_usage_step_verifiers for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists form_usage_step_verifiers_admin_delete on public.form_usage_step_verifiers;
create policy form_usage_step_verifiers_admin_delete
on public.form_usage_step_verifiers for delete to authenticated
using (public.is_current_user_admin());

grant select, insert, update, delete on table public.form_usage_step_verifiers to authenticated;
grant all on table public.form_usage_step_verifiers to service_role;

alter table public.surat_signatures
  add column if not exists verification_required boolean not null default false,
  add column if not exists verification_status text not null default 'not_required'
    check (verification_status in ('not_required', 'pending', 'verified')),
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verification_note text,
  add column if not exists verifier_snapshot jsonb not null default '[]'::jsonb;

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = p_surat_id
      and (
        sr.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures ss
          where ss.surat_id = sr.id
            and (
              ss.user_id = auth.uid()
              or exists (
                select 1
                from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
                where verifier->>'user_id' = auth.uid()::text
              )
            )
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  );
$$;

create or replace function public.save_form_usage_config(
  p_usage_id uuid,
  p_payload jsonb,
  p_department_ids uuid[],
  p_steps jsonb,
  p_attachments jsonb,
  p_verifiers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_department_id uuid;
  v_step jsonb;
  v_attachment jsonb;
  v_verifier jsonb;
  v_step_id uuid;
  v_step_map jsonb := '{}'::jsonb;
  v_user_id uuid;
  v_stage_order integer;
  v_usage_step_id uuid;
  v_step_orders integer[] := array[]::integer[];
begin
  if not public.is_current_user_admin() then
    raise exception 'Akses ditolak: hanya admin'
      using errcode = '42501';
  end if;

  if p_usage_id is null then
    insert into public.form_usages (
      name,
      description,
      form_id,
      route_id,
      request_category,
      scope_type,
      status,
      sort_order,
      updated_at,
      created_by
    )
    values (
      nullif(trim(p_payload->>'name'), ''),
      nullif(trim(p_payload->>'description'), ''),
      nullif(p_payload->>'form_id', '')::uuid,
      nullif(p_payload->>'route_id', '')::uuid,
      coalesce(nullif(p_payload->>'request_category', ''), 'non_unit'),
      coalesce(nullif(p_payload->>'scope_type', ''), 'all'),
      coalesce(nullif(p_payload->>'status', ''), 'draft'),
      coalesce((p_payload->>'sort_order')::integer, 0),
      now(),
      auth.uid()
    )
    returning id into v_usage_id;
  else
    update public.form_usages
    set
      name = nullif(trim(p_payload->>'name'), ''),
      description = nullif(trim(p_payload->>'description'), ''),
      form_id = nullif(p_payload->>'form_id', '')::uuid,
      route_id = nullif(p_payload->>'route_id', '')::uuid,
      request_category = coalesce(nullif(p_payload->>'request_category', ''), request_category),
      scope_type = coalesce(nullif(p_payload->>'scope_type', ''), scope_type),
      status = coalesce(nullif(p_payload->>'status', ''), status),
      sort_order = coalesce((p_payload->>'sort_order')::integer, sort_order),
      updated_at = now()
    where id = p_usage_id
    returning id into v_usage_id;

    if v_usage_id is null then
      raise exception 'Kegunaan form tidak ditemukan'
        using errcode = 'P0002';
    end if;
  end if;

  delete from public.form_usage_attachment_requirements
  where usage_id = v_usage_id;
  delete from public.form_usage_departments
  where usage_id = v_usage_id;

  if p_department_ids is not null then
    foreach v_department_id in array p_department_ids
    loop
      if v_department_id is not null then
        insert into public.form_usage_departments (usage_id, department_id)
        values (v_usage_id, v_department_id);
      end if;
    end loop;
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    v_step_orders := array_append(v_step_orders, (v_step->>'step_order')::integer);

    select id
    into v_step_id
    from public.form_usage_steps
    where usage_id = v_usage_id
      and step_order = (v_step->>'step_order')::integer;

    if v_step_id is null then
      insert into public.form_usage_steps (
        usage_id,
        step_order,
        role_name,
        label,
        signer_department_id,
        action_type
      )
      values (
        v_usage_id,
        (v_step->>'step_order')::integer,
        coalesce(nullif(v_step->>'role_name', ''), 'memeriksa'),
        nullif(trim(v_step->>'label'), ''),
        nullif(v_step->>'signer_department_id', '')::uuid,
        coalesce(nullif(v_step->>'action_type', ''), 'approval')
      )
      returning id into v_step_id;
    else
      update public.form_usage_steps
      set
        role_name = coalesce(nullif(v_step->>'role_name', ''), role_name),
        label = coalesce(nullif(trim(v_step->>'label'), ''), label),
        signer_department_id = nullif(v_step->>'signer_department_id', '')::uuid,
        action_type = coalesce(nullif(v_step->>'action_type', ''), action_type)
      where id = v_step_id;
    end if;

    delete from public.form_usage_step_users
    where usage_step_id = v_step_id;
    delete from public.form_usage_step_verifiers
    where usage_step_id = v_step_id;

    v_step_map := jsonb_set(
      v_step_map,
      array[(v_step->>'step_order')],
      to_jsonb(v_step_id::text),
      true
    );

    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_step->'eligible_user_ids', '[]'::jsonb)) as value
    loop
      insert into public.form_usage_step_users (usage_step_id, user_id)
      values (v_step_id, v_user_id);
    end loop;

    for v_user_id in
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_step->'verifier_user_ids', '[]'::jsonb)) as value
    loop
      insert into public.form_usage_step_verifiers (usage_step_id, user_id)
      values (v_step_id, v_user_id)
      on conflict do nothing;
    end loop;
  end loop;

  for v_verifier in select * from jsonb_array_elements(coalesce(p_verifiers, '[]'::jsonb))
  loop
    v_usage_step_id := nullif(v_step_map->>(v_verifier->>'step_order'), '')::uuid;
    if v_usage_step_id is not null then
      for v_user_id in
        select value::uuid
        from jsonb_array_elements_text(coalesce(v_verifier->'user_ids', '[]'::jsonb)) as value
      loop
        insert into public.form_usage_step_verifiers (usage_step_id, user_id)
        values (v_usage_step_id, v_user_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  delete from public.form_usage_step_users
  where usage_step_id in (
    select step.id
    from public.form_usage_steps step
    where step.usage_id = v_usage_id
      and not (step.step_order = any(v_step_orders))
      and not exists (
        select 1
        from public.surat_signatures signature
        where signature.form_usage_step_id = step.id
      )
  );

  delete from public.form_usage_step_verifiers
  where usage_step_id in (
    select step.id
    from public.form_usage_steps step
    where step.usage_id = v_usage_id
      and not (step.step_order = any(v_step_orders))
      and not exists (
        select 1
        from public.surat_signatures signature
        where signature.form_usage_step_id = step.id
      )
  );

  delete from public.form_usage_steps step
  where step.usage_id = v_usage_id
    and not (step.step_order = any(v_step_orders))
    and not exists (
      select 1
      from public.surat_signatures signature
      where signature.form_usage_step_id = step.id
    );

  for v_attachment in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb))
  loop
    v_stage_order := coalesce((v_attachment->>'stage_order')::integer, 0);
    v_usage_step_id := case
      when v_stage_order = 0 then null
      else nullif(v_step_map->>v_stage_order::text, '')::uuid
    end;

    insert into public.form_usage_attachment_requirements (
      usage_id,
      usage_step_id,
      stage_order,
      requirement_key,
      label,
      is_required,
      allow_multiple,
      min_files,
      max_files,
      allowed_types,
      max_size_bytes,
      sort_order
    )
    values (
      v_usage_id,
      v_usage_step_id,
      v_stage_order,
      nullif(trim(v_attachment->>'requirement_key'), ''),
      nullif(trim(v_attachment->>'label'), ''),
      coalesce((v_attachment->>'is_required')::boolean, true),
      coalesce((v_attachment->>'allow_multiple')::boolean, false),
      coalesce((v_attachment->>'min_files')::integer, 1),
      coalesce((v_attachment->>'max_files')::integer, 1),
      coalesce(array(select jsonb_array_elements_text(v_attachment->'allowed_types')), array[]::text[]),
      nullif(v_attachment->>'max_size_bytes', '')::bigint,
      coalesce((v_attachment->>'sort_order')::integer, 0)
    );
  end loop;

  return v_usage_id;
end;
$$;

create or replace function public.validate_form_usage_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_step public.form_usage_steps;
  v_verifiers jsonb := '[]'::jsonb;
begin
  select registration.form_usage_id
  into v_usage_id
  from public.surat_registrasi as registration
  where registration.id = new.surat_id;

  if v_usage_id is null then
    return new;
  end if;

  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select *
  into v_step
  from public.form_usage_steps
  where id = new.form_usage_step_id
    and usage_id = v_usage_id;

  if not found then
    raise exception 'Tahap signer tidak sesuai kegunaan form.';
  end if;

  if not exists (
    select 1
    from public.form_usage_step_users as candidate
    where candidate.usage_step_id = v_step.id
      and candidate.user_id = new.user_id
  ) then
    raise exception 'User bukan kandidat signer pada tahap ini.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', verifier.user_id,
    'full_name', profile.full_name,
    'job_title', profile.job_title
  ) order by profile.full_name), '[]'::jsonb)
  into v_verifiers
  from public.form_usage_step_verifiers verifier
  left join public.profiles profile on profile.id = verifier.user_id
  where verifier.usage_step_id = v_step.id;

  new.step_order := v_step.step_order;
  new.role_name := v_step.role_name;
  new.label_jabatan := v_step.label;
  new.action_type := v_step.action_type;
  new.requires_unit_allocation := v_step.action_type = 'unit_allocation';
  new.verifier_snapshot := v_verifiers;
  new.verification_required := jsonb_array_length(v_verifiers) > 0;
  if new.verification_required then
    new.verification_status := coalesce(nullif(new.verification_status, 'not_required'), 'pending');
    if new.verification_status = 'not_required' then
      new.verification_status := 'pending';
    end if;
  else
    new.verification_status := 'not_required';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
  end if;

  return new;
end;
$$;

create or replace function public.handle_approve_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text,
  p_file_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_step integer;
  v_signature_step integer;
  v_total_steps integer;
  v_created_by uuid;
  v_no_surat text;
  v_judul_surat text;
  v_is_done boolean := false;
  v_verification_required boolean := false;
  v_verification_status text := 'not_required';
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select sr.current_step, sr.created_by, sr.no_surat, sr.judul_surat
  into v_current_step, v_created_by, v_no_surat, v_judul_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id
    and sr.status = 'PROSES'
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  select ss.step_order, ss.verification_required, ss.verification_status
  into v_signature_step, v_verification_required, v_verification_status
  from public.surat_signatures ss
  where ss.id = p_sig_id
    and ss.surat_id = p_surat_id
    and ss.user_id = v_actor
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Tanda tangan tidak tersedia untuk user ini';
  end if;

  if v_signature_step <> v_current_step then
    raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';
  end if;

  if v_verification_required and v_verification_status <> 'verified' then
    raise exception 'Data pengajuan belum diverifikasi tim pengecek';
  end if;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      file_path_snap = p_file_path,
      status = 'APPROVED'
  where id = p_sig_id;

  select count(*)
  into v_total_steps
  from public.surat_signatures
  where surat_id = p_surat_id;

  if v_current_step >= v_total_steps then
    update public.surat_registrasi
    set file_path = p_file_path,
        status = 'DONE',
        updated_at = now()
    where id = p_surat_id;
    v_is_done := true;
  else
    update public.surat_registrasi
    set file_path = p_file_path,
        current_step = v_current_step + 1,
        updated_at = now()
    where id = p_surat_id;

    update public.surat_signatures
    set available_at = coalesce(available_at, now())
    where surat_id = p_surat_id
      and step_order = v_current_step + 1
      and is_signed = false;
  end if;

  if v_is_done and v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data, link)
    values (
      v_created_by,
      'success',
      'Dokumen Selesai Disetujui',
      'Dokumen "' || coalesce(v_judul_surat, '') || '" (' || coalesce(v_no_surat, '') || ') telah menyelesaikan seluruh tahap persetujuan.',
      jsonb_build_object(
        'surat_id', p_surat_id,
        'no_surat', v_no_surat,
        'judul', v_judul_surat,
        'file_path', p_file_path
      ),
      '/surat/monitoring'
    );
  end if;

  return json_build_object('success', true, 'isDone', v_is_done);
end;
$$;

create or replace function public.handle_reject_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_step integer;
  v_signature_step integer;
  v_verification_required boolean := false;
  v_verification_status text := 'not_required';
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if nullif(trim(p_note), '') is null then
    raise exception 'Catatan penolakan wajib diisi';
  end if;

  select sr.current_step
  into v_current_step
  from public.surat_registrasi sr
  where sr.id = p_surat_id
    and sr.status = 'PROSES'
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  select ss.step_order, ss.verification_required, ss.verification_status
  into v_signature_step, v_verification_required, v_verification_status
  from public.surat_signatures ss
  where ss.id = p_sig_id
    and ss.surat_id = p_surat_id
    and ss.user_id = v_actor
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Tanda tangan tidak tersedia untuk user ini';
  end if;

  if v_signature_step <> v_current_step then
    raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';
  end if;

  if v_verification_required and v_verification_status <> 'verified' then
    raise exception 'Data pengajuan belum diverifikasi tim pengecek';
  end if;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      status = 'REJECTED'
  where id = p_sig_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      updated_at = now()
  where id = p_surat_id;

  return true;
end;
$$;

create or replace function public.verify_surat_signature(
  p_sig_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_surat_id uuid;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select ss.surat_id
  into v_surat_id
  from public.surat_signatures ss
  join public.surat_registrasi sr on sr.id = ss.surat_id
  where ss.id = p_sig_id
    and sr.status = 'PROSES'
    and ss.step_order = sr.current_step
    and ss.is_signed = false
    and ss.verification_required = true
    and ss.verification_status <> 'verified'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) verifier
      where verifier->>'user_id' = v_actor::text
    )
  for update of ss;

  if not found then
    raise exception 'Tugas verifikasi tidak tersedia untuk user ini';
  end if;

  update public.surat_signatures
  set verification_status = 'verified',
      verified_at = now(),
      verified_by = v_actor,
      verification_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_sig_id;

  update public.surat_registrasi
  set updated_at = now()
  where id = v_surat_id;

  return true;
end;
$$;

revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.verify_surat_signature(uuid, text) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.verify_surat_signature(uuid, text) to authenticated, service_role;
