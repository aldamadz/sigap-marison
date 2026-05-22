create or replace function public.finance_take_action(
  p_review_id uuid,
  p_action text,
  p_note text default ''::text,
  p_file_path text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_surat_id uuid;
  v_form_id uuid;
  v_judul text;
  v_no_surat text;
  v_created_by uuid;
  v_pic_id uuid;
  v_fin_name text;
  v_notif_title text;
  v_notif_msg text;
  v_notif_type text;
  v_review_status text;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_action not in ('DONE','REJECTED') then
    raise exception 'Aksi tidak valid: %', p_action;
  end if;

  if not exists (
    select 1
    from public.master_dept_pics mdp
    join public.master_departments md on md.id = mdp.dept_id
    where mdp.user_id = v_actor
      and (
        lower(coalesce(md.code, '')) = 'keu'
        or lower(coalesce(md.name, '')) like '%keuangan%'
      )
  ) then
    raise exception 'Anda bukan PIC Departemen Keuangan';
  end if;

  select fr.surat_id, fr.form_id, fr.status, sr.judul_surat, sr.no_surat, sr.created_by, sr.pic_id
  into v_surat_id, v_form_id, v_review_status, v_judul, v_no_surat, v_created_by, v_pic_id
  from public.finance_reviews fr
  join public.surat_registrasi sr on sr.id = fr.surat_id
  where fr.id = p_review_id
  for update of fr;

  if not found then
    raise exception 'Review keuangan tidak ditemukan';
  end if;

  if v_review_status <> 'PENDING' then
    raise exception 'Review keuangan sudah diproses';
  end if;

  select full_name into v_fin_name
  from public.profiles
  where id = v_actor;

  update public.finance_reviews
  set
    status = p_action,
    note = case when p_note <> '' then p_note else note end,
    payment_file_path = coalesce(p_file_path, payment_file_path),
    action_at = now(),
    action_by = v_actor,
    updated_at = now()
  where id = p_review_id
    and status = 'PENDING';

  if not found then
    raise exception 'Review keuangan sudah diproses';
  end if;

  update public.surat_registrasi
  set
    pic_review_status = case p_action when 'DONE' then 'KEUANGAN_DONE' else 'KEUANGAN_REJECTED' end,
    chat_status = 'CLOSED',
    chat_closed_at = now(),
    updated_at = now()
  where id = v_surat_id;

  insert into public.surat_chats (surat_id, sender_id, message, is_system, sender_name, sender_role)
  values (
    v_surat_id,
    v_actor,
    case p_action
      when 'DONE' then 'Tim Keuangan telah menyelesaikan proses dokumen ini.' || case when p_note <> '' then ' Catatan: ' || p_note else '' end
      when 'REJECTED' then 'Tim Keuangan menolak dokumen ini. Pembuat perlu mengajukan ulang.' || case when p_note <> '' then ' Alasan: ' || p_note else '' end
    end,
    true,
    v_fin_name,
    'system'
  );

  if p_action = 'DONE' then
    v_notif_title := 'Proses Keuangan Selesai';
    v_notif_type := 'success';
    v_notif_msg := 'Tim Keuangan telah menyelesaikan dokumen "' || v_judul || '" (' || v_no_surat || ').';
  else
    v_notif_title := 'Dokumen Ditolak Tim Keuangan';
    v_notif_type := 'warning';
    v_notif_msg := 'Tim Keuangan menolak dokumen "' || v_judul || '". Silakan ajukan ulang.' || case when p_note <> '' then ' Alasan: ' || p_note else '' end;
  end if;

  if v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_created_by,
      v_notif_type,
      v_notif_title,
      v_notif_msg,
      jsonb_build_object('surat_id', v_surat_id, 'no_surat', v_no_surat, 'action', p_action)
    );
  end if;

  if v_pic_id is not null and v_pic_id <> v_created_by then
    insert into public.notifications (user_id, type, title, message, data)
    values (
      v_pic_id,
      v_notif_type,
      v_notif_title,
      v_notif_msg,
      jsonb_build_object('surat_id', v_surat_id, 'no_surat', v_no_surat, 'action', p_action)
    );
  end if;

  return json_build_object('success', true, 'action', p_action);
end;
$function$;

revoke execute on function public.finance_take_action(uuid, text, text, text) from public;
revoke execute on function public.finance_take_action(uuid, text, text, text) from anon;
grant execute on function public.finance_take_action(uuid, text, text, text) to authenticated;
