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
            and ss.user_id = auth.uid()
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

create or replace function public.can_create_surat_signature(p_surat_id uuid)
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
      and sr.created_by = auth.uid()
  );
$$;

revoke all on function public.can_read_surat(uuid) from public, anon;
revoke all on function public.can_create_surat_signature(uuid) from public, anon;
grant execute on function public.can_read_surat(uuid) to authenticated, service_role;
grant execute on function public.can_create_surat_signature(uuid) to authenticated, service_role;

drop policy if exists "Participants and admins can view surat" on public.surat_registrasi;
drop policy if exists "Participants and admins can view signatures" on public.surat_signatures;
drop policy if exists "Creators can insert surat signatures" on public.surat_signatures;
drop policy if exists "Participants and admins can view surat attachments" on public.surat_attachments;
drop policy if exists "Participants and admins can view PDF jobs" on public.document_pdf_jobs;

create policy "Participants and admins can view surat"
on public.surat_registrasi
for select
to authenticated
using (public.can_read_surat(id));

create policy "Participants and admins can view signatures"
on public.surat_signatures
for select
to authenticated
using (public.can_read_surat(surat_id));

create policy "Creators can insert surat signatures"
on public.surat_signatures
for insert
to authenticated
with check (public.can_create_surat_signature(surat_id));

create policy "Participants and admins can view surat attachments"
on public.surat_attachments
for select
to authenticated
using (
  created_by = auth.uid()
  or public.can_read_surat(surat_id)
);

create policy "Participants and admins can view PDF jobs"
on public.document_pdf_jobs
for select
to authenticated
using (
  requested_by = auth.uid()
  or public.can_read_surat(surat_id)
);
