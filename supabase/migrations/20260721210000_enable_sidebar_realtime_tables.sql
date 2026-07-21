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
    'surat_registrasi',
    'surat_signatures',
    'surat_revision_events',
    'surat_recommendation_tasks',
    'notifications'
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
