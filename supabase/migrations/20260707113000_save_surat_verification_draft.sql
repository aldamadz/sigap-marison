create or replace function public.save_surat_verification_draft(
  p_sig_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_signature public.surat_signatures%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_actor_role text;
  v_verifier_ids uuid[];
  v_snapshot jsonb;
  v_drafts jsonb;
  v_draft jsonb;
begin
  if v_actor is null then
    raise exception 'Unauthorized';
  end if;

  select *
  into v_signature
  from public.surat_signatures
  where id = p_sig_id;

  if v_signature.id is null then
    raise exception 'Data tanda tangan tidak ditemukan';
  end if;

  select *
  into v_surat
  from public.surat_registrasi
  where id = v_signature.surat_id;

  if v_surat.id is null then
    raise exception 'Dokumen tidak ditemukan';
  end if;

  select role
  into v_actor_role
  from public.profiles
  where id = v_actor;

  select coalesce(array_agg((entry->>'user_id')::uuid), array[]::uuid[])
  into v_verifier_ids
  from jsonb_array_elements(coalesce(v_signature.verifier_snapshot, '[]'::jsonb)) as entry
  where nullif(entry->>'user_id', '') is not null;

  if not (
    v_actor = v_signature.user_id
    or v_actor = any(v_verifier_ids)
    or coalesce(v_actor_role, '') = 'admin'
  ) then
    raise exception 'Akses ditolak';
  end if;

  if v_signature.verification_required is not true then
    raise exception 'Tahap ini tidak membutuhkan pemeriksaan';
  end if;

  v_snapshot := coalesce(v_surat.data_snapshot, '{}'::jsonb);
  v_drafts := coalesce(v_snapshot->'verification_drafts', '{}'::jsonb);
  v_draft := jsonb_build_object(
    'signature_id', p_sig_id,
    'surat_id', v_signature.surat_id,
    'step_order', v_signature.step_order,
    'saved_by', v_actor,
    'saved_at', now(),
    'input', coalesce(p_payload, '{}'::jsonb),
    'note', nullif(trim(coalesce(p_note, '')), '')
  );

  update public.surat_registrasi
  set data_snapshot = jsonb_set(
    v_snapshot,
    '{verification_drafts}',
    v_drafts || jsonb_build_object(p_sig_id::text, v_draft),
    true
  )
  where id = v_signature.surat_id;

  return v_draft;
end;
$$;

revoke all on function public.save_surat_verification_draft(uuid, jsonb, text) from public, anon;
grant execute on function public.save_surat_verification_draft(uuid, jsonb, text) to authenticated, service_role;
