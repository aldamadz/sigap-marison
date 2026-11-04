-- Migration: 20260928030948_realtime_publish_inbox_agenda_tables.sql
-- Purpose: publish the remaining tables subscribed by the realtime surfaces so
--          that postgres_change events are actually delivered.
--
-- Context (docs/REALTIME_MATRIX.md RC-5):
--   Supabase Realtime only delivers events for tables in the supabase_realtime
--   publication. Subscribing to an unpublished table returns SUBSCRIBED but
--   delivers no events. The following subscribers were silently dead:
--     - surat_attachments        (RealtimeSync suratKeys, InboxPage)
--     - surat_linked_documents   (InboxPage)
--     - agendas                  (RealtimeSync agendaKeys)
--     - activity_logs            (RealtimeSync, attention-adjacent surfaces)
--
-- Safety (why each table is safe to publish):
--   Realtime delivery is filtered by the subscriber's RLS policies. Publishing a
--   table does NOT expose rows; it only makes change events eligible for
--   delivery, and each event row is still evaluated against the receiver's RLS.
--     - surat_attachments:      SELECT policy `Participants and admins can view
--                               surat attachments` — created_by = auth.uid() or
--                               can_read_surat(surat_id).
--     - surat_linked_documents: SELECT policy `surat_linked_documents_select_access`
--                               — can_access_surat(parent) or can_access_surat(child).
--     - agendas:                SELECT policy `agendas_select_scope` — office
--                               hierarchy scope.
--     - activity_logs:          SELECT policy `Admins can read activity logs` —
--                               admin only, so non-admins receive nothing.
--
--   No policy is changed by this migration. No cross-user access is opened. No
--   service-role key is involved (the browser subscribes with its own user JWT
--   through the BFF).
--
-- Idempotent: each table is added only when it is not already in the publication.
-- Forward-only: no DROP, no data change.
--
-- Rollback: `alter publication supabase_realtime drop table ...` for the four
-- tables. Safe because the app falls back to focus-refetch.

do $$
declare
  table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime does not exist';
  end if;

  foreach table_name in array array[
    'surat_attachments',
    'surat_linked_documents',
    'agendas',
    'activity_logs'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Realtime table public.% does not exist', table_name;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;
