#!/usr/bin/env bash
# Disposable PostgreSQL runner for the marison idempotency key integration test.
# - Prepares the canonical schema (profiles, surat_registrasi, marison_outbound_dispatches)
# - Applies the migrations
# - Runs supabase/tests/marison_idempotency_key.integration.sql
# - Always removes the container (finally)
set -euo pipefail

CONTAINER_NAME="sigap-idempotency-key-test-$$"
PG_IMAGE="postgres:17"
MIGRATIONS_DIR="supabase/migrations"
TEST_FILE="supabase/tests/marison_idempotency_key.integration.sql"

cleanup() {
  echo "[runner] removing container ${CONTAINER_NAME}"
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[runner] starting disposable PostgreSQL"
docker run -d --name "${CONTAINER_NAME}" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 127.0.0.1::5432 \
  "${PG_IMAGE}" >/dev/null

# Wait for readiness
for i in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null || { echo "[runner] postgres not ready"; exit 1; }

echo "[runner] creating extensions and Supabase roles"
docker exec "${CONTAINER_NAME}" psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
docker exec "${CONTAINER_NAME}" psql -U postgres -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;" >/dev/null 2>&1 || true
# Supabase exposes pgcrypto functions under the extensions schema
docker exec -i "${CONTAINER_NAME}" psql -U postgres >/dev/null <<'SQLEOF'
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;
CREATE OR REPLACE FUNCTION extensions.digest(text, text) RETURNS bytea
LANGUAGE sql STABLE AS 'SELECT public.digest($1::text, $2::text)';
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea
LANGUAGE sql STABLE AS 'SELECT public.digest($1::bytea, $2::text)';
SQLEOF

echo "[runner] preparing canonical schema"
docker exec -i "${CONTAINER_NAME}" psql -U postgres >/dev/null <<'SQLEOF'
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  nik text NOT NULL,
  full_name text NOT NULL,
  job_title text NOT NULL,
  avatar_url text,
  role text DEFAULT 'user',
  parent_id uuid,
  deleted_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  department_id uuid,
  email text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  join_date date,
  resign_date date,
  office_id uuid,
  theme_preference text NOT NULL DEFAULT 'system',
  marison_employee_id bigint,
  marison_user_id bigint,
  marison_synced_at timestamptz,
  marison_last_seen_at timestamptz,
  marison_review_required boolean NOT NULL DEFAULT false,
  marison_review_reasons text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE TABLE public.surat_registrasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no_surat text,
  judul_surat text NOT NULL,
  status text DEFAULT 'PROSES',
  current_step integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  request_date date,
  requester_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  location_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  form_input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.profiles(id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  type text,
  title text,
  message text,
  data jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
SQLEOF

echo "[runner] applying base migration 20260729103000"
docker cp "${MIGRATIONS_DIR}/20260729103000_durable_marison_outbound_dispatch.sql" "${CONTAINER_NAME}:/tmp/m001.sql"
docker exec "${CONTAINER_NAME}" psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m001.sql

echo "[runner] applying replacement migration 20260803120000"
docker cp "${MIGRATIONS_DIR}/20260803120000_marison_outbound_replacement_jobs.sql" "${CONTAINER_NAME}:/tmp/m002.sql"
docker exec "${CONTAINER_NAME}" psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m002.sql

echo "[runner] applying fix migration 20260805090000"
docker cp "${MIGRATIONS_DIR}/20260805090000_fix_generation_aware_idempotency_key.sql" "${CONTAINER_NAME}:/tmp/m003.sql"
docker exec "${CONTAINER_NAME}" psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m003.sql

echo "[runner] running integration test"
docker cp "${TEST_FILE}" "${CONTAINER_NAME}:/tmp/test.sql"
if ! docker exec "${CONTAINER_NAME}" psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/test.sql; then
  echo "[runner] integration test FAILED"
  exit 1
fi

echo "[runner] integration test PASSED"
