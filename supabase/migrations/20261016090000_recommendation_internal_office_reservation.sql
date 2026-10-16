-- SUR-33: recommendation numbers use Pusat while their parent stays at KC/KCP.
-- Do not grant the requester Pusat access or bypass ordinary issuing guards.
begin;

create schema if not exists recommendation_numbering_internal;
revoke all on schema recommendation_numbering_internal from public, anon, authenticated, service_role;
create table if not exists recommendation_numbering_internal.reservation_authorizations (
  reservation_id uuid primary key,
  transaction_id bigint not null,
  backend_pid integer not null,
  actor_id uuid not null,
  expected_context jsonb not null
);
revoke all on recommendation_numbering_internal.reservation_authorizations from public, anon, authenticated, service_role;

do $patch$
declare
  v_owner text;
  v_definition text;
  v_old text;
  v_new text;
  v_body_hash text;
begin
  -- Deployments may use supabase_admin while the existing routines own postgres.
  for v_owner in
    select distinct pg_get_userbyid(p.proowner)
    from pg_proc p
    where p.oid in (
      'public.create_recommendation_task_for_parent(uuid)'::regprocedure,
      'public.guard_delegated_issuing_office()'::regprocedure
    )
  loop
    if v_owner not in ('postgres', 'supabase_admin') then
      raise exception 'Unexpected recommendation routine owner: %', v_owner;
    end if;
    execute format('grant usage on schema recommendation_numbering_internal to %I', v_owner);
    execute format('grant select, insert, delete on recommendation_numbering_internal.reservation_authorizations to %I', v_owner);
  end loop;

  v_definition := replace(pg_get_functiondef('public.create_recommendation_task_for_parent(uuid)'::regprocedure), E'\r\n', E'\n');
  if position('recommendation_numbering_internal.reservation_authorizations' in v_definition) = 0 then
    select md5(replace(prosrc, E'\r\n', E'\n')) into v_body_hash
      from pg_proc where oid = 'public.create_recommendation_task_for_parent(uuid)'::regprocedure;
    if v_body_hash not in ('fd524c7d70113e0da939c028d10c841b', '9009e29d07df04cb0887206e12b2b85b') then
      raise exception 'Unrecognized recommendation factory body; audit before migration.';
    end if;
    -- Production still has the exact July factory; staging has the August one.
    -- Normalize only that audited body to the internal allocation (forward-only).
    if v_body_hash = 'fd524c7d70113e0da939c028d10c841b' then
      v_definition := replace(v_definition, '  v_reservation_id uuid;', '  v_start_from integer := 1;' || E'\n' || '  v_reservation_id uuid;');
      v_old := substring(v_definition from position('  -- The parent requester owns the reservation' in v_definition)
        for position('  select entity.code into v_entity_code' in v_definition) - position('  -- The parent requester owns the reservation' in v_definition));
      v_new := $normalize$  perform pg_advisory_xact_lock(hashtext(concat_ws(
    ':', 'letter-number', v_entity_id::text, v_year::text, 'pusat', v_department_id::text
  )));
  select coalesce(max(config.start_from), 1) into v_start_from
  from public.letter_number_counter_configs config
  where config.scope_type = 'pusat' and config.is_active = true
    and config.entity_id = v_entity_id
    and config.dept_id is not distinct from v_department_id
    and config.project_id is null and config.year = v_year;
  select greatest(coalesce(max(reservation.no_urut), 0) + 1, v_start_from) into v_no_urut
  from public.surat_reservations reservation
  where reservation.entity_id = v_entity_id
    and reservation.dept_id is not distinct from v_department_id
    and reservation.project_id is null and reservation.year = v_year;

  insert into public.surat_reservations (
    entity_id, type_id, office_id, project_id, dept_id, year, no_urut,
    status, reserved_by, created_at, expires_at
  )
  values (
    v_entity_id, v_letter_type_id, v_office_id, null, v_department_id,
    v_year, v_no_urut, 'PENDING', v_actor, now(), now() + interval '7 days'
  )
  returning id into v_reservation_id;

$normalize$;
      v_definition := replace(v_definition, v_old, v_new);
    end if;
    -- Nullable represented_by_admin must not turn a failed ownership check NULL.
    v_old := $anchor$  if not (
    v_parent.created_by = v_actor
    or v_parent.represented_by_admin = v_actor
    or v_is_admin
  ) then$anchor$;
    v_new := $body$  if (
    v_parent.created_by = v_actor
    or v_parent.represented_by_admin = v_actor
    or v_is_admin
  ) is not true then$body$;
    if position(v_old in v_definition) = 0 then raise exception 'Unknown recommendation ownership check; stop.'; end if;
    v_definition := replace(v_definition, v_old, v_new);
    v_old := $anchor$  insert into public.surat_reservations (
    entity_id, type_id, office_id, project_id, dept_id, year, no_urut,
    status, reserved_by, created_at, expires_at
  )
  values (
    v_entity_id, v_letter_type_id, v_office_id, null, v_department_id,
    v_year, v_no_urut, 'PENDING', v_actor, now(), now() + interval '7 days'
  )
  returning id into v_reservation_id;$anchor$;
    v_new := $body$  -- One-use capability: only this validated factory can authorize this row.
  v_reservation_id := gen_random_uuid();
  insert into recommendation_numbering_internal.reservation_authorizations (
    reservation_id, transaction_id, backend_pid, actor_id, expected_context
  ) values (
    v_reservation_id, txid_current(), pg_backend_pid(), v_actor,
    jsonb_build_object(
      'entity_id', v_entity_id, 'type_id', v_letter_type_id,
      'office_id', v_office_id, 'project_id', null, 'dept_id', v_department_id,
      'year', v_year, 'no_urut', v_no_urut, 'status', 'PENDING', 'reserved_by', v_actor
    )
  );
  insert into public.surat_reservations (
    id, entity_id, type_id, office_id, project_id, dept_id, year, no_urut,
    status, reserved_by, created_at, expires_at
  )
  values (
    v_reservation_id, v_entity_id, v_letter_type_id, v_office_id, null, v_department_id,
    v_year, v_no_urut, 'PENDING', v_actor, now(), now() + interval '7 days'
  )
  returning id into v_reservation_id;
  if exists (select 1 from recommendation_numbering_internal.reservation_authorizations where reservation_id = v_reservation_id) then
    raise exception 'Internal recommendation reservation authorization was not consumed.';
  end if;$body$;
    if position(v_old in v_definition) = 0 then
      raise exception 'Unknown internal recommendation allocator; stop without changing permissions.';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;

  v_definition := replace(pg_get_functiondef('public.guard_delegated_issuing_office()'::regprocedure), E'\r\n', E'\n');
  if position('recommendation_numbering_internal.reservation_authorizations' in v_definition) = 0 then
    v_old := '  if auth.uid() is null or not public.can_issue_for_office(new.office_id) then';
    v_new := $body$  if tg_table_name = 'surat_reservations' and tg_op = 'INSERT' and auth.uid() is not null then
    delete from recommendation_numbering_internal.reservation_authorizations capability
    where capability.reservation_id = new.id
      and capability.transaction_id = pg_catalog.txid_current()
      and capability.backend_pid = pg_catalog.pg_backend_pid()
      and capability.actor_id = auth.uid()
      and capability.actor_id = new.reserved_by
      and capability.expected_context = pg_catalog.jsonb_build_object(
        'entity_id', new.entity_id, 'type_id', new.type_id,
        'office_id', new.office_id, 'project_id', new.project_id, 'dept_id', new.dept_id,
        'year', new.year, 'no_urut', new.no_urut, 'status', new.status::text, 'reserved_by', new.reserved_by
      );
    if found then return new; end if;
  end if;
$body$ || v_old;
    if position(v_old in v_definition) = 0 then raise exception 'Unknown issuing-office guard; stop.'; end if;
    execute replace(v_definition, v_old, v_new);
  end if;

  if (select count(*) from pg_trigger where tgname = 'guard_delegated_issuing_office'
      and tgrelid in ('public.surat_reservations'::regclass, 'public.surat_registrasi'::regclass)
      and tgenabled = 'O' and not tgisinternal
      and tgfoid = 'public.guard_delegated_issuing_office()'::regprocedure) <> 2 then
    raise exception 'Issuing-office guards missing or disabled; stop.';
  end if;
end $patch$;

notify pgrst, 'reload schema';
commit;
