-- Keep dashboard statistics inside Postgres so the client receives four numbers
-- instead of every registration and signature row.
create or replace function public.get_my_surat_monitoring_stats(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total bigint,
  selesai bigint,
  proses bigint,
  ditolak bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with classified as (
    select
      case
        when sr.status in ('REJECTED', 'DITOLAK')
          or exists (
            select 1
            from public.surat_signatures ss
            where ss.surat_id = sr.id and ss.status = 'REJECTED'
          ) then 'ditolak'
        when sr.status in ('DONE', 'SELESAI')
          or (
            exists (select 1 from public.surat_signatures ss where ss.surat_id = sr.id)
            and not exists (
              select 1
              from public.surat_signatures ss
              where ss.surat_id = sr.id and not coalesce(ss.is_signed, false)
            )
          ) then 'selesai'
        else 'proses'
      end as bucket
    from public.surat_registrasi sr
    where sr.created_by = auth.uid()
      and (p_date_from is null or sr.created_at >= p_date_from)
      and (p_date_to is null or sr.created_at <= p_date_to)
  )
  select
    count(*)::bigint,
    count(*) filter (where bucket = 'selesai')::bigint,
    count(*) filter (where bucket = 'proses')::bigint,
    count(*) filter (where bucket = 'ditolak')::bigint
  from classified;
$$;

revoke all on function public.get_my_surat_monitoring_stats(timestamptz, timestamptz) from public;
revoke all on function public.get_my_surat_monitoring_stats(timestamptz, timestamptz) from anon;
grant execute on function public.get_my_surat_monitoring_stats(timestamptz, timestamptz) to authenticated;

create index if not exists idx_surat_registrasi_created_by_created_at
  on public.surat_registrasi (created_by, created_at desc);

create index if not exists idx_surat_registrasi_status_created_at
  on public.surat_registrasi (status, created_at desc);

create index if not exists idx_surat_signatures_surat_status_signed
  on public.surat_signatures (surat_id, status, is_signed);

-- Attention previously required six PostgREST round trips per refresh. This
-- service-role-only aggregate returns the same state as one compact row.
create or replace function public.get_attention_state_for_user(p_user_id uuid)
returns table (
  approval_count bigint,
  verification_count bigint,
  revision_count bigint,
  recommendation_count bigint,
  unread_notifications bigint,
  monitoring_count bigint,
  follow_up_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (
      select count(*)
      from public.surat_signatures ss
      join public.surat_registrasi sr on sr.id = ss.surat_id
      where ss.user_id = p_user_id
        and not coalesce(ss.is_signed, false)
        and sr.status = 'PROSES'
        and ss.step_order = sr.current_step
    )::bigint,
    (
      select count(*)
      from public.surat_signatures ss
      join public.surat_registrasi sr on sr.id = ss.surat_id
      where not coalesce(ss.is_signed, false)
        and ss.verification_required = true
        and ss.verification_status = 'pending'
        and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
        and sr.status = 'PROSES'
        and ss.step_order = sr.current_step
    )::bigint,
    (
      select count(*)
      from public.surat_revision_events sre
      where sre.status in ('open', 'awaiting_requester')
        and p_user_id = any(sre.target_user_ids)
        and sre.target_type is distinct from 'requester'
    )::bigint,
    (
      select count(*)
      from public.surat_recommendation_tasks srt
      where srt.status in ('waiting', 'claimed')
        and srt.candidate_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
        and (srt.status = 'waiting' or srt.claimed_by = p_user_id)
    )::bigint,
    (
      select count(*)
      from public.notifications n
      where n.user_id = p_user_id and n.is_read is not true
    )::bigint,
    (
      select count(*)
      from public.surat_registrasi sr
      where sr.created_by = p_user_id
        and sr.status = 'DONE'
        and (sr.creator_seen_at is null or sr.updated_at > sr.creator_seen_at)
    )::bigint,
    (
      select count(*)
      from public.surat_revision_events sre
      where sre.status in ('open', 'awaiting_requester')
        and p_user_id = any(sre.target_user_ids)
        and sre.target_type = 'requester'
    )::bigint;
$$;

revoke all on function public.get_attention_state_for_user(uuid) from public;
revoke all on function public.get_attention_state_for_user(uuid) from anon;
revoke all on function public.get_attention_state_for_user(uuid) from authenticated;
grant execute on function public.get_attention_state_for_user(uuid) to service_role;

create index if not exists idx_surat_signatures_user_pending
  on public.surat_signatures (user_id, surat_id, step_order)
  where not is_signed;

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where is_read is not true;

create index if not exists idx_revision_events_target_users_active
  on public.surat_revision_events using gin (target_user_ids)
  where status in ('open', 'awaiting_requester');
