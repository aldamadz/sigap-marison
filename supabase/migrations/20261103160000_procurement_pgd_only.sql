begin;

-- Classify trusted persisted form identities, never the user-editable request category.
create or replace function public.marison_procurement_routing_block(p_surat_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  with identities as (
    select upper(btrim(value)) as code
    from public.surat_registrasi sr
    left join public.form_usages usage on usage.id = sr.form_usage_id
    left join public.master_forms form on form.id = usage.form_id
    cross join lateral unnest(array[
      sr.location_snapshot#>>'{form,nomor_form}',
      sr.data_snapshot#>>'{form,nomor_form}',
      form.nomor_form
    ]) as codes(value)
    where sr.id = p_surat_id and nullif(btrim(value), '') is not null
  )
  select case
    when exists(select 1 from identities where code ~ '(^|[. /_-])KEU([. /_-]|$)') then 'finance_not_connected'
    when not exists(select 1 from identities) then 'form_identity_unavailable'
    when exists(select 1 from identities where code !~ '(^|[. /_-])PGD([. /_-]|$)') then 'form_not_procurement'
    else null
  end;
$$;
revoke all on function public.marison_procurement_routing_block(uuid) from public, anon, authenticated;
grant execute on function public.marison_procurement_routing_block(uuid) to service_role;

-- Preserve the active canonical enqueue/claim logic and fail if its shape drifted.
do $migration$
declare
  v_definition text;
  v_anchor text := E'  select d.id into v_job_id\n  from public.marison_outbound_dispatches d';
begin
  v_definition := replace(pg_get_functiondef('public.ensure_marison_outbound_dispatch(uuid,text)'::regprocedure), E'\r\n', E'\n');
  if position('marison_procurement_routing_block' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 or position('returns jsonb' in lower(v_definition)) = 0 then
      raise exception 'Unknown outbound enqueue implementation; audit before applying procurement boundary';
    end if;
    v_definition := replace(v_definition, v_anchor, $guard$
  if public.marison_procurement_routing_block(p_surat_id) is not null then
    return jsonb_build_object('dispatch_id',null,'skipped',true,
      'code',public.marison_procurement_routing_block(p_surat_id),'no_dispatch',true);
  end if;
$guard$ || v_anchor);
    execute v_definition;
  end if;
  v_definition := replace(pg_get_functiondef('public.claim_marison_outbound_dispatch(text)'::regprocedure), E'\r\n', E'\n');
  v_anchor := 'where candidate.environment = p_environment';
  if position('marison_procurement_routing_block' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Unknown outbound claim implementation; audit before applying procurement boundary';
    end if;
    execute replace(v_definition, v_anchor, v_anchor || E'\n    and public.marison_procurement_routing_block(candidate.surat_id) is null');
  end if;
end;
$migration$;

create or replace function public.guard_marison_procurement_dispatch()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if public.marison_procurement_routing_block(new.surat_id) is not null then
      raise exception 'Only validated PGD forms may dispatch to Procurement; KEU remains in SIGAP'
        using errcode = '55000';
    end if;
  elsif new.status in ('pending','processing','failed_retryable')
      or (old.post_started_at is null and new.post_started_at is not null)
      or old.payload_body is distinct from new.payload_body then
    if public.marison_procurement_routing_block(new.surat_id) is not null then
      raise exception 'Only validated PGD forms may dispatch to Procurement; KEU remains in SIGAP'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_marison_procurement_dispatch() from public, anon, authenticated, service_role;
drop trigger if exists guard_marison_procurement_dispatch on public.marison_outbound_dispatches;
create trigger guard_marison_procurement_dispatch before insert or update on public.marison_outbound_dispatches
for each row execute function public.guard_marison_procurement_dispatch();

-- Retain evidence; cancel only unsent work. Never rewrite POST results or receipts.
update public.marison_outbound_dispatches d
set status = 'skipped', skipped_code = public.marison_procurement_routing_block(d.surat_id),
    skipped_reason = 'Tidak dikirim ke Pengadaan: hanya form PGD. Form KEU tetap di SIGAP sampai integrasi Keuangan tersedia.',
    completed_at = clock_timestamp(), lease_token = null, lease_acquired_at = null, lease_expires_at = null,
    updated_at = clock_timestamp()
where d.status in ('pending','processing','failed_retryable')
  and d.post_started_at is null and d.response is null and d.external_reference is null
  and public.marison_procurement_routing_block(d.surat_id) is not null;

notify pgrst, 'reload schema';
commit;
