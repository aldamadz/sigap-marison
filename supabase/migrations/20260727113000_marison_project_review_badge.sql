drop function if exists public.get_attention_state_for_user(uuid);

create function public.get_attention_state_for_user(p_user_id uuid)
returns table (
  approval_count bigint,
  verification_count bigint,
  revision_count bigint,
  recommendation_count bigint,
  unread_notifications bigint,
  monitoring_count bigint,
  follow_up_count bigint,
  master_office_review_count bigint,
  profile_review_count bigint,
  master_project_review_count bigint
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
    )::bigint,
    (
      select
        (select count(*) from public.master_offices o where o.marison_review_required)
        + (select count(*) from public.marison_sync_issues i where i.status = 'open' and i.entity_type = 'branch')
      where exists (
        select 1 from public.profiles p
        where p.id = p_user_id
          and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
      )
    )::bigint,
    (
      select
        (select count(*) from public.profiles p where p.marison_review_required and p.deleted_at is null)
        + (select count(*) from public.marison_sync_issues i where i.status = 'open' and i.entity_type = 'employee')
      where exists (
        select 1 from public.profiles p
        where p.id = p_user_id
          and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
      )
    )::bigint,
    (
      select
        (select count(*) from public.master_projects mp where mp.marison_review_required)
        + (select count(*) from public.marison_sync_issues i where i.status = 'open' and i.entity_type = 'project')
      where exists (
        select 1 from public.profiles p
        where p.id = p_user_id
          and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
      )
    )::bigint;
$$;

revoke all on function public.get_attention_state_for_user(uuid) from public;
revoke all on function public.get_attention_state_for_user(uuid) from anon;
revoke all on function public.get_attention_state_for_user(uuid) from authenticated;
grant execute on function public.get_attention_state_for_user(uuid) to service_role;
