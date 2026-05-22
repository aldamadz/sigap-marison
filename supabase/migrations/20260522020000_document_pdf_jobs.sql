create table if not exists public.document_pdf_jobs (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  signature_id uuid references public.surat_signatures(id) on delete set null,
  source_file_path text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  pdf_url text,
  error_message text,
  attempt_count integer not null default 0,
  requested_by uuid references auth.users(id) on delete set null,
  refresh boolean not null default false,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_document_pdf_jobs_status_created
  on public.document_pdf_jobs(status, created_at);

create index if not exists idx_document_pdf_jobs_surat_status
  on public.document_pdf_jobs(surat_id, status);

alter table public.document_pdf_jobs enable row level security;

drop policy if exists "Users can view readable PDF jobs" on public.document_pdf_jobs;

create policy "Users can view readable PDF jobs"
  on public.document_pdf_jobs
  for select
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1
      from public.surat_registrasi sr
      where sr.id = document_pdf_jobs.surat_id
        and (
          sr.created_by = auth.uid()
          or sr.pic_id = auth.uid()
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
    )
  );

create or replace function public.claim_document_pdf_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_max_attempts integer default 3,
  p_stale_after interval default interval '10 minutes'
)
returns setof public.document_pdf_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.document_pdf_jobs j
    where
      (
        j.status = 'queued'
        or (
          j.status = 'failed'
          and j.attempt_count < p_max_attempts
        )
        or (
          j.status = 'processing'
          and j.locked_at < now() - p_stale_after
          and j.attempt_count < p_max_attempts
        )
      )
    order by j.created_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.document_pdf_jobs j
  set
    status = 'processing',
    locked_by = p_worker_id,
    locked_at = now(),
    attempt_count = j.attempt_count + 1,
    error_message = null,
    updated_at = now()
  from candidates
  where j.id = candidates.id
  returning j.*;
end;
$$;
