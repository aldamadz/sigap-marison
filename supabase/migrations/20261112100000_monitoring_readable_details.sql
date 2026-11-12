begin;

-- Extend reading, not visibility or mutation authority. Refuse recursive scopes.
do $guard$
declare scope text; progress text;
begin
  select prosrc into scope from pg_proc where oid='public.can_monitor_surat_scope(uuid)'::regprocedure;
  select prosrc into progress from pg_proc where oid='public.can_monitor_surat_progress(uuid)'::regprocedure;
  if scope ilike '%can_read_surat%' or scope ilike '%can_monitor_surat_progress%'
    or progress ilike '%can_read_surat%' or position('can_monitor_surat_scope' in progress)=0 then
    raise exception 'Unknown monitoring authority; audit recursive dependencies before applying.';
  end if;
end $guard$;

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.can_monitor_surat_progress(p_surat_id);
$$;

revoke all on function public.can_read_surat(uuid) from public,anon;
grant execute on function public.can_read_surat(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
