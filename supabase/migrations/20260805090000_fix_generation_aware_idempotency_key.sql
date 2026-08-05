-- Migration: 20260805090000_fix_generation_aware_idempotency_key.sql
-- Purpose: prepare_marison_outbound_dispatch menulis ulang idempotency_key
--          ke format legacy tanpa suffix generasi, menyebabkan UNIQUE
--          collision saat replacement gen > 1 diproses.
--
-- Root cause:
--   create_marison_outbound_replacement menulis key:
--     sigap:staging:{kind}:{surat_id}:g{generation}  (generation-aware)
--   prepare_marison_outbound_dispatch menimpa key menjadi:
--     sigap:staging:{kind}:{surat_id}                 (legacy, no suffix)
--   Saat gen=2 diproses worker, prepare menimpa key menjadi format gen=1
--   yang sudah dipakai dispatch asli → UNIQUE collision.
--
-- Fix:
--   Hitung expected_key secara deterministik sebelum mutasi.
--   generation=1:
--     sigap:<environment>:<kind>:<surat_id>
--   generation>1:
--     sigap:<environment>:<kind>:<surat_id>:g<generation>
--   Bandingkan stored key dengan expected_key via equality.
--   Jika stored key bukan NULL dan ≠ expected_key → fail-closed 55000.
--   Jika stored key = expected_key atau NULL → lanjut/set sesuai.
--
-- Design decisions:
--   - Key match menggunakan equality (=), bukan LIKE suffix.
--   - Fail-closed sebelum payload dimutasi — tidak ada key regenerasi.
--   - generation=1 tetap backward-compatible (key legacy).
--   - Unique constraint tetap enforced.

-- Audit staging (read-only, 2026-08-05):
--   2 job terdampak, stored key sudah :g2, collision di-rollback:
--     56041f33: unit gen=2, surat=a3b5fa26..., key=...:g2, payload=null, never_POST
--     22916bdb: unit gen=2, surat=5f96591b..., key=...:g2, payload=null, never_POST
--   Tidak perlu data repair.

begin;

create or replace function public.prepare_marison_outbound_dispatch(
  p_job_id uuid,
  p_lease_token uuid,
  p_kind text,
  p_endpoint text,
  p_contract_version text,
  p_payload jsonb,
  p_payload_body text,
  p_payload_hash text
)
returns table (
  kind text,
  endpoint text,
  contract_version text,
  payload jsonb,
  payload_body text,
  payload_hash text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.marison_outbound_dispatches%rowtype;
  v_expected_key text;
begin
  if p_lease_token is null
     or p_payload is null
     or nullif(p_payload_body, '') is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(convert_to(p_payload_body, 'UTF8'), 'sha256'), 'hex') <> p_payload_hash then
    raise exception 'Invalid prepared payload' using errcode = '22023';
  end if;

  if not (
    (p_kind = 'unit' and p_endpoint = '/unit-submissions')
    or (p_kind = 'non_unit' and p_endpoint = '/non-unit-submissions')
    or (p_kind = 'asset' and p_endpoint = '/asset-purchase-requests')
  ) then
    raise exception 'Invalid dispatch kind or endpoint' using errcode = '22023';
  end if;

  select d.* into v_job
  from public.marison_outbound_dispatches d
  where d.id = p_job_id
  for update;

  if not found
     or v_job.status <> 'processing'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_expires_at <= clock_timestamp()
     or v_job.post_started_at is not null then
    raise exception 'Stale or invalid dispatch lease' using errcode = '55000';
  end if;

  -- Compute expected key deterministically based on generation
  if v_job.generation = 1 then
    v_expected_key := format('sigap:%s:%s:%s', v_job.environment, p_kind, v_job.surat_id);
  else
    v_expected_key := format('sigap:%s:%s:%s:g%s', v_job.environment, p_kind, v_job.surat_id, v_job.generation);
  end if;

  -- Fail-closed if stored key exists and does not match expected key
  if v_job.idempotency_key is not null and v_job.idempotency_key <> v_expected_key then
    raise exception 'Stored idempotency key does not match expected key for generation %', v_job.generation
      using errcode = '55000';
  end if;

  if v_job.payload is null then
    update public.marison_outbound_dispatches d
    set kind = p_kind,
        endpoint = p_endpoint,
        contract_version = p_contract_version,
        payload = p_payload,
        payload_body = p_payload_body,
        payload_hash = p_payload_hash,
        payload_built_at = clock_timestamp(),
        idempotency_key = v_expected_key,
        updated_at = clock_timestamp()
    where d.id = p_job_id;
  elsif v_job.kind is distinct from p_kind
     or v_job.endpoint is distinct from p_endpoint
     or v_job.contract_version is distinct from p_contract_version
     or v_job.payload is distinct from p_payload
     or v_job.payload_body is distinct from p_payload_body
     or v_job.payload_hash is distinct from p_payload_hash then
    raise exception 'Prepared payload is immutable' using errcode = '55000';
  end if;

  update public.marison_outbound_dispatches d
  set lease_acquired_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
  where d.id = p_job_id
    and d.status = 'processing'
    and d.lease_token = p_lease_token;

  return query
  select d.kind, d.endpoint, d.contract_version, d.payload, d.payload_body, d.payload_hash
  from public.marison_outbound_dispatches d
  where d.id = p_job_id;
end;
$$;

revoke all on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.prepare_marison_outbound_dispatch(uuid, uuid, text, text, text, jsonb, text, text) to service_role;

commit;
