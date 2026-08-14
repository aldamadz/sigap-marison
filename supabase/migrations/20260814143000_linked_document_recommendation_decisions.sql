-- REC-03: expose only the canonical recommendation decision model to users
-- who can already access the linked parent document.
drop function if exists public.get_surat_linked_documents(uuid);

create function public.get_surat_linked_documents(p_parent_surat_id uuid)
returns table (
  id uuid,
  parent_surat_id uuid,
  child_surat_id uuid,
  link_type text,
  status text,
  required_before_step integer,
  created_at timestamptz,
  child_no_surat text,
  child_judul_surat text,
  child_status text,
  child_current_step integer,
  child_file_path text,
  child_pdf_path text,
  child_created_at timestamptz,
  child_created_by uuid,
  child_recommendation_multi_detail jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_surat(p_parent_surat_id) then
    raise exception 'Akses dokumen tidak diizinkan.';
  end if;

  return query
  select
    link.id,
    link.parent_surat_id,
    link.child_surat_id,
    link.link_type,
    link.status,
    link.required_before_step,
    link.created_at,
    child.no_surat,
    child.judul_surat,
    child.status,
    child.current_step,
    child.file_path,
    child.pdf_path,
    child.created_at,
    child.created_by,
    child.form_input_data->'recommendation_multi_detail'
  from public.surat_linked_documents link
  join public.surat_registrasi child on child.id = link.child_surat_id
  where link.parent_surat_id = p_parent_surat_id
    and link.status = 'active'
  order by link.created_at desc;
end;
$$;

revoke all on function public.get_surat_linked_documents(uuid) from public, anon;
grant execute on function public.get_surat_linked_documents(uuid) to authenticated, service_role;
