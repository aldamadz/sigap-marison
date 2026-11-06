begin;
create table if not exists public.release_notice_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 dismissed_release_id uuid not null,
 dismissed_at timestamptz not null default now()
);
alter table public.release_notice_preferences enable row level security;
revoke all on public.release_notice_preferences from public,anon,authenticated;
grant select on public.release_notice_preferences to authenticated;
grant select,insert,update,delete on public.release_notice_preferences to service_role;
drop policy if exists release_notice_preferences_own on public.release_notice_preferences;
create policy release_notice_preferences_own on public.release_notice_preferences for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.dismiss_release_notice(p_release_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_release_id is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true and p.deleted_at is null) then
  raise exception 'Sesi tidak diizinkan.' using errcode='42501';
 end if;
 insert into public.release_notice_preferences(user_id,dismissed_release_id) values(auth.uid(),p_release_id)
 on conflict(user_id) do update set dismissed_release_id=excluded.dismissed_release_id,dismissed_at=now();
end $$;
revoke all on function public.dismiss_release_notice(uuid) from public,anon;
grant execute on function public.dismiss_release_notice(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
