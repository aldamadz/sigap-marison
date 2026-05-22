create or replace function public.is_surat_department_pic(
  p_surat_id uuid,
  p_actor uuid
)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.surat_registrasi sr
    join public.master_penggunaan_detail mpd on mpd.id = sr.penggunaan_id
    join public.master_forms mf on mf.id = mpd.form_id
    join public.master_dept_pics mdp on mdp.dept_id = mf.department_id
    where sr.id = p_surat_id
      and mdp.user_id = p_actor
  );
$$;

create or replace function public.pic_open_chat(p_surat_id uuid, p_pic_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_judul text;
  v_no_surat text;
  v_created_by uuid;
  v_pic_name text;
  v_current_status text;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_pic_id <> v_actor then
    raise exception 'PIC tidak sesuai dengan user login';
  end if;

  select judul_surat, no_surat, created_by, pic_review_status
  into v_judul, v_no_surat, v_created_by, v_current_status
  from public.surat_registrasi
  where id = p_surat_id;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  if not public.is_surat_department_pic(p_surat_id, v_actor) then
    raise exception 'Anda bukan PIC departemen surat ini';
  end if;

  select full_name into v_pic_name from public.profiles where id = v_actor;

  update public.surat_registrasi set
    pic_id = v_actor,
    chat_status = 'OPEN',
    chat_opened_at = now(),
    chat_closed_at = null,
    pic_review_status = case
      when v_current_status is null or v_current_status = '' then 'PENDING'
      else v_current_status
    end,
    updated_at = now()
  where id = p_surat_id;

  insert into public.surat_chats (surat_id, sender_id, message, is_system, sender_name, sender_role)
  values (
    p_surat_id,
    v_actor,
    'Chat dibuka oleh PIC ' || coalesce(v_pic_name, 'PIC') || '. Anda dapat berdiskusi mengenai dokumen ini.',
    true,
    v_pic_name,
    'system'
  );

  if v_created_by is not null and v_created_by <> v_actor then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_created_by,
      'info',
      'PIC Membuka Sesi Diskusi',
      'PIC ' || coalesce(v_pic_name, '') || ' telah membuka chat untuk dokumen "' || v_judul || '" (' || v_no_surat || ').',
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'action', 'chat_opened')
    );
  end if;

  return json_build_object('success', true, 'chat_status', 'OPEN');
end;
$function$;

create or replace function public.pic_close_chat(p_surat_id uuid, p_pic_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_judul text;
  v_no_surat text;
  v_created_by uuid;
  v_pic_name text;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_pic_id <> v_actor then
    raise exception 'PIC tidak sesuai dengan user login';
  end if;

  select judul_surat, no_surat, created_by
  into v_judul, v_no_surat, v_created_by
  from public.surat_registrasi
  where id = p_surat_id;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  if not public.is_surat_department_pic(p_surat_id, v_actor) then
    raise exception 'Anda bukan PIC departemen surat ini';
  end if;

  select full_name into v_pic_name from public.profiles where id = v_actor;

  update public.surat_registrasi
  set chat_status = 'CLOSED',
      chat_closed_at = now(),
      updated_at = now()
  where id = p_surat_id;

  insert into public.surat_chats (surat_id, sender_id, message, is_system, sender_name, sender_role)
  values (
    p_surat_id,
    v_actor,
    'Chat ditutup oleh PIC ' || coalesce(v_pic_name, 'PIC') || '. Sesi diskusi telah berakhir.',
    true,
    v_pic_name,
    'system'
  );

  if v_created_by is not null and v_created_by <> v_actor then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_created_by,
      'warning',
      'Sesi Diskusi Ditutup',
      'PIC ' || coalesce(v_pic_name, '') || ' telah menutup chat untuk dokumen "' || v_judul || '".',
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'action', 'chat_closed')
    );
  end if;

  return json_build_object('success', true, 'chat_status', 'CLOSED');
end;
$function$;

create or replace function public.pic_take_action(
  p_surat_id uuid,
  p_pic_id uuid,
  p_action text,
  p_note text default ''::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_judul text;
  v_no_surat text;
  v_created_by uuid;
  v_pic_name text;
  v_pic_attachment text;
  v_notif_title text;
  v_notif_msg text;
  v_notif_type text;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_pic_id <> v_actor then
    raise exception 'PIC tidak sesuai dengan user login';
  end if;

  if p_action not in ('SPK', 'KEUANGAN', 'REJECTED') then
    raise exception 'Aksi tidak valid: %', p_action;
  end if;

  select judul_surat, no_surat, created_by, pic_attachment
  into v_judul, v_no_surat, v_created_by, v_pic_attachment
  from public.surat_registrasi
  where id = p_surat_id;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  if not public.is_surat_department_pic(p_surat_id, v_actor) then
    raise exception 'Anda bukan PIC departemen surat ini';
  end if;

  if p_action = 'SPK' and nullif(trim(coalesce(v_pic_attachment, '')), '') is null then
    raise exception 'File SPK wajib diunggah sebelum menerbitkan SPK';
  end if;

  select full_name into v_pic_name from public.profiles where id = v_actor;

  update public.surat_registrasi set
    pic_review_status = p_action,
    pic_note = p_note,
    pic_id = v_actor,
    pic_action_at = now(),
    pic_action_by = v_actor,
    chat_status = 'CLOSED',
    chat_closed_at = now(),
    status = case p_action when 'REJECTED' then 'REJECTED' else status end,
    updated_at = now()
  where id = p_surat_id;

  insert into public.surat_chats (surat_id, sender_id, message, is_system, sender_name, sender_role)
  values (
    p_surat_id,
    v_actor,
    case p_action
      when 'SPK' then 'PIC menerbitkan SPK. Proses selesai.' || case when p_note <> '' then ' Catatan: ' || p_note else '' end
      when 'KEUANGAN' then 'PIC mengalihkan ke Tim Keuangan. Proses di PIC selesai.' || case when p_note <> '' then ' Catatan: ' || p_note else '' end
      when 'REJECTED' then 'PIC menolak dokumen ini.' || case when p_note <> '' then ' Alasan: ' || p_note else '' end
    end,
    true,
    v_pic_name,
    'system'
  );

  case p_action
    when 'SPK' then
      v_notif_title := 'SPK Diterbitkan';
      v_notif_msg := 'PIC ' || coalesce(v_pic_name, '') || ' telah menerbitkan SPK untuk dokumen "' || v_judul || '".';
      v_notif_type := 'success';
    when 'KEUANGAN' then
      v_notif_title := 'Dokumen Dialihkan ke Keuangan';
      v_notif_msg := 'PIC ' || coalesce(v_pic_name, '') || ' mengalihkan dokumen "' || v_judul || '" ke Tim Keuangan.';
      v_notif_type := 'info';
    when 'REJECTED' then
      v_notif_title := 'Dokumen Ditolak PIC';
      v_notif_msg := 'PIC ' || coalesce(v_pic_name, '') || ' menolak dokumen "' || v_judul || '".' || case when p_note <> '' then ' Alasan: ' || p_note else '' end;
      v_notif_type := 'warning';
  end case;

  if v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_created_by,
      v_notif_type,
      v_notif_title,
      v_notif_msg,
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'action', p_action, 'note', p_note)
    );
  end if;

  return json_build_object('success', true, 'action', p_action);
end;
$function$;

create or replace function public.pic_to_finance(
  p_surat_id uuid,
  p_pic_id uuid,
  p_note text default ''::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_judul text;
  v_no_surat text;
  v_created_by uuid;
  v_form_id uuid;
  v_pic_name text;
  v_fin_user record;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_pic_id <> v_actor then
    raise exception 'PIC tidak sesuai dengan user login';
  end if;

  select sr.judul_surat, sr.no_surat, sr.created_by, mpd.form_id
  into v_judul, v_no_surat, v_created_by, v_form_id
  from public.surat_registrasi sr
  left join public.master_penggunaan_detail mpd on mpd.id = sr.penggunaan_id
  where sr.id = p_surat_id;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  if not public.is_surat_department_pic(p_surat_id, v_actor) then
    raise exception 'Anda bukan PIC departemen surat ini';
  end if;

  select full_name into v_pic_name from public.profiles where id = v_actor;

  update public.surat_registrasi set
    pic_review_status = 'KEUANGAN',
    pic_note = p_note,
    pic_id = v_actor,
    pic_action_at = now(),
    pic_action_by = v_actor,
    chat_status = 'OPEN',
    updated_at = now()
  where id = p_surat_id;

  insert into public.finance_reviews (surat_id, form_id, assigned_by, status, note)
  values (p_surat_id, v_form_id, v_actor, 'PENDING', p_note)
  on conflict do nothing;

  insert into public.surat_chats (surat_id, sender_id, message, is_system, sender_name, sender_role)
  values (
    p_surat_id,
    v_actor,
    'PIC ' || coalesce(v_pic_name, 'PIC') || ' mengalihkan dokumen ini ke Tim Keuangan. Proses PIC selesai.' || case when p_note <> '' then ' Catatan: ' || p_note else '' end,
    true,
    v_pic_name,
    'system'
  );

  for v_fin_user in
    select distinct mdp.user_id
    from public.master_dept_pics mdp
    join public.master_departments md on md.id = mdp.dept_id
    where lower(coalesce(md.code, '')) = 'keu'
       or lower(coalesce(md.name, '')) like '%keuangan%'
  loop
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_fin_user.user_id,
      'info',
      'Dokumen Baru dari PIC',
      'Dokumen "' || v_judul || '" (' || v_no_surat || ') dari PIC ' || coalesce(v_pic_name, '') || ' perlu ditangani.',
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'action', 'to_finance')
    );
  end loop;

  if v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_created_by,
      'info',
      'Dokumen Dialihkan ke Keuangan',
      'Dokumen "' || v_judul || '" telah dialihkan PIC ke Tim Keuangan untuk diproses.',
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'action', 'to_finance')
    );
  end if;

  return json_build_object('success', true, 'form_id', v_form_id);
end;
$function$;

revoke execute on function public.is_surat_department_pic(uuid, uuid) from public;
grant execute on function public.is_surat_department_pic(uuid, uuid) to authenticated;
