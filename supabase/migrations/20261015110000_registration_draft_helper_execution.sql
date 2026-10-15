begin;

-- Self-hosted migrations may be owned by supabase_admin while the existing
-- office trigger runs as non-superuser postgres. Repair only that private call.
do $$
declare
  v_helper regprocedure := 'registration_draft_lifecycle_internal.is_recommendation_task_draft(uuid,uuid,text,jsonb)'::regprocedure;
  v_guard regprocedure := 'public.guard_draft_issuing_office()'::regprocedure;
  v_role text;
begin
  if not exists(select 1 from pg_proc where oid=v_guard and prosecdef
      and proowner='postgres'::regrole)
    or not exists(select 1 from pg_proc where oid=v_helper and prosecdef)
    or not has_schema_privilege('postgres','registration_draft_lifecycle_internal','usage') then
    raise exception 'Unexpected draft helper ownership/security context; inspect before applying';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if pg_has_role(v_role,'postgres','USAGE') or has_function_privilege(v_role,v_helper,'execute') then
      raise exception 'Unexpected API-role access to draft helper: %',v_role;
    end if;
  end loop;
end $$;

grant execute on function registration_draft_lifecycle_internal.is_recommendation_task_draft(uuid,uuid,text,jsonb)
  to postgres;

notify pgrst, 'reload schema';
commit;
