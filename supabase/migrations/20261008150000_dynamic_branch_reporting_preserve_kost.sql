begin;

-- Kost has a configured supervisor/director chain, not a branch-manager chain.
create or replace function organization_internal.is_automatic(p_office uuid, p_title text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.master_offices o where o.id = p_office
      and lower(trim(o.kedudukan)) in ('kc', 'kcp')
  ) and trim(coalesce(p_title, '')) !~* '^(branch\s+manager|bm)$'
    and coalesce(p_title, '') !~* '(^|[^a-z0-9])(direktur|director)([^a-z0-9]|$)';
$$;
revoke all on function organization_internal.is_automatic(uuid,text) from public, anon, authenticated;

-- Only undo derived Kost edges with a complete audit chain matching the current
-- value. A later configured edit, or an unrelated employee, is never overwritten.
with original as (
  select distinct on (profile_id) profile_id, old_parent_id, office_id, new_parent_id
  from public.profile_reporting_events order by profile_id, id
), latest as (
  select distinct on (profile_id) profile_id, new_parent_id
  from public.profile_reporting_events order by profile_id, id desc
)
update public.profiles p set parent_id=original.old_parent_id, reporting_is_automatic=false
from original join latest using(profile_id), public.master_offices o
where p.id=original.profile_id and o.id=p.office_id and lower(trim(o.kedudukan))='kost'
  and p.reporting_is_automatic and p.parent_id is not distinct from latest.new_parent_id
  and original.office_id=p.office_id
  and exists (
    select 1 from public.activity_logs a
    where a.table_name='profiles' and a.action::text='UPDATE' and a.record_id::text=p.id::text
      and a.old_values->>'office_id'=p.office_id::text and a.new_values->>'office_id'=p.office_id::text
      and a.old_values->>'reporting_is_automatic'='false' and a.new_values->>'reporting_is_automatic'='true'
      and a.old_values->>'job_title' is not distinct from a.new_values->>'job_title'
      and a.old_values->>'is_active' is not distinct from a.new_values->>'is_active'
      and a.old_values->>'deleted_at' is not distinct from a.new_values->>'deleted_at'
      and a.old_values->>'parent_id' is not distinct from original.old_parent_id::text
      and a.new_values->>'parent_id' is not distinct from original.new_parent_id::text
  )
  and (original.old_parent_id is null or exists(select 1 from public.profiles parent where parent.id=original.old_parent_id));

update public.profiles p set parent_id=null, reporting_is_automatic=false
from public.master_offices o where p.office_id=o.id and lower(trim(o.kedudukan))='kost'
  and p.reporting_is_automatic;

select organization_internal.refresh_reporting();
notify pgrst, 'reload schema';
commit;
