-- Migration: 20260928120000_realtime_drop_profiles_from_publication.sql
-- Purpose: stop broadcasting full profile rows over Supabase Realtime.
--
-- Root cause:
--   public.profiles is a member of the supabase_realtime publication, and the
--   SELECT policy `profiles_select_authenticated` allows every authenticated
--   user to read every profile with deleted_at IS NULL. postgres_changes
--   delivers FULL rows, so any profile INSERT/UPDATE/DELETE broadcast nik,
--   email, and phone numbers to every logged-in subscriber — including via
--   /api/events?tables=profiles, which previously accepted any table name.
--
-- Why DROP (not a policy change):
--   The application legitimately needs broad profiles QUERY access: the user
--   directory pickers (SuratForm, Inbox), the Team hierarchy
--   (OrganizationHierarchyPage, admin), parent-user lookups, and admin user
--   management all read profiles. Tightening profiles_select_authenticated
--   would break those features and needs an explicit product decision about
--   who may read employee profiles — out of scope here.
--   Publication membership does NOT affect PostgREST queries; dropping the
--   table from the publication only stops the realtime broadcast. All query
--   features keep working unchanged.
--
-- Compensating refresh (no realtime needed):
--   - AttentionProvider badge refresh: session refresh (5 min), tab-focus
--     refetch, and reconnect revalidation already revalidate attention state.
--   - RealtimeSync userKeys (users/activity-logs/recent-logs): still
--     revalidated on reconnect and on window focus via focusKeys.
--   - OrganizationHierarchyPage (admin): refetches ['users'] on window
--     focus / visibilitychange instead of a profiles subscription.
--
-- Server boundary (same change set):
--   backend/src/modules/bff/bff-runtime.ts gains REALTIME_ALLOWED_TABLES;
--   /api/events now rejects any table outside the allowlist with 400, so even
--   a future profiles subscription cannot re-open this broadcast.
--
-- Idempotent: drops only when the table is currently in the publication.
-- Forward-only: no policy, data, or history change.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime drop table public.profiles';
  end if;
end
$$;
