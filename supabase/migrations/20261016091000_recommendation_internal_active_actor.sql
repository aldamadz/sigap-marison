-- SUR-33: a transaction capability never overrides account deactivation.
begin;
do $patch$
declare v_definition text; v_old text; v_new text;
begin
  v_definition := replace(pg_get_functiondef('public.guard_delegated_issuing_office()'::regprocedure), E'\r\n', E'\n');
  if position('-- recommendation capability requires an active actor' in v_definition) > 0 then return; end if;
  v_old := '      and capability.actor_id = new.reserved_by';
  if position('recommendation_numbering_internal.reservation_authorizations' in v_definition) = 0
    or position(v_old in v_definition) = 0 then raise exception 'Unknown recommendation capability guard; stop.'; end if;
  v_new := v_old || E'\n' || $body$      -- recommendation capability requires an active actor
      and exists (select 1 from public.profiles actor where actor.id = capability.actor_id
        and actor.is_active is true and actor.deleted_at is null)$body$;
  execute replace(v_definition, v_old, v_new);
end $patch$;
notify pgrst, 'reload schema';
commit;
