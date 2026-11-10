begin;
-- Production migrations may be owned by supabase_admin while the canonical
-- registration RPC remains owned by the non-superuser postgres role.
grant usage on schema unit_allocation_internal to postgres;
grant execute on function unit_allocation_internal.requester_input(jsonb) to postgres;
commit;
