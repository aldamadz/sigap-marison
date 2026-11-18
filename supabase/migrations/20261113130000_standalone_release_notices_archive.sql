begin;

create or replace function public.get_release_notice_history()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_releases jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Sesi tidak diizinkan.' using errcode='42501';
  end if;
  -- Expose published content only, never admin drafts, actor details or audit snapshots.
  select coalesce(jsonb_agg(jsonb_build_object('id',item->>'id','publishedAt',item->>'publishedAt',
    'expiresAt',item->>'expiresAt','items',item->'items') order by revision desc),'[]'::jsonb)
  into v_releases from (
    select event.revision,event.after_state->'active_release' item
    from public.release_notice_events event
    where event.action='publish'
      and (event.after_state->'active_release'->>'publishedAt')::timestamptz<=clock_timestamp()
      and not exists(select 1 from public.release_notice_events withdrawal where withdrawal.action='withdraw'
        and withdrawal.before_state->'active_release'->>'id'=event.after_state->'active_release'->>'id')
    order by event.revision desc limit 50
  ) published;
  return jsonb_build_object('releases',v_releases);
end $$;

revoke all on function public.get_release_notice_history() from public, anon, authenticated;
grant execute on function public.get_release_notice_history() to authenticated;
notify pgrst, 'reload schema';
commit;
