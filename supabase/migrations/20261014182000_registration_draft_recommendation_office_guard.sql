begin;

-- Canonical recommendation tasks authorize their candidate to reopen the same
-- USED number. Keep the issuing-office match, never authorize from a label.
create or replace function public.guard_draft_issuing_office()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_office uuid; v_context jsonb; v_recommendation boolean;
begin
  if new.status <> 'DRAFT' or new.reservation_id is null then return new; end if;
  v_context := issuing_office_internal.draft_context(new.payload);
  v_recommendation := auth.uid() = new.created_by and
    registration_draft_lifecycle_internal.is_recommendation_task_draft(
      new.reservation_id,new.created_by,new.no_surat,new.payload);
  select r.office_id into v_office from public.surat_reservations r
    where r.id = new.reservation_id and r.reserved_by = new.created_by
      and (r.status = 'PENDING' or (v_recommendation and r.status = 'USED'));
  if v_office is null or nullif(v_context->>'office_id','')::uuid is distinct from v_office then
    raise exception 'Kantor draft tidak sesuai reservasi nomor.' using errcode = '42501';
  end if;
  if not coalesce(v_recommendation,false) and not public.can_issue_for_office(v_office) then
    raise exception 'Akses kantor penerbit telah dicabut.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_draft_issuing_office() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
