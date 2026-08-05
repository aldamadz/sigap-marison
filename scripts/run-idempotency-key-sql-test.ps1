# Disposable PostgreSQL runner for marison idempotency key integration test (Windows PowerShell).
# Prepares canonical schema, applies migrations, runs the test, always removes container.
$ErrorActionPreference = "Stop"

$ContainerName = "sigap-idempotency-key-test-" + $PID
$MigrationsDir = "supabase/migrations"
$TestFile = "supabase/tests/marison_idempotency_key.integration.sql"

try {
  Write-Host "[runner] starting disposable PostgreSQL container $ContainerName"
  docker run -d --name $ContainerName -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1::5432 postgres:17 | Out-Null

  # Wait for readiness
  for ($i = 1; $i -le 30; $i++) {
    $ready = docker exec $ContainerName pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  docker exec $ContainerName pg_isready -U postgres | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Postgres not ready" }

  Write-Host "[runner] creating extensions and Supabase roles"
  docker exec $ContainerName psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" | Out-Null
  docker exec $ContainerName psql -U postgres -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;" 2>$null | Out-Null
  # Supabase exposes pgcrypto functions under the extensions schema
  $shim = @'
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO public;
CREATE OR REPLACE FUNCTION extensions.digest(text, text) RETURNS bytea
LANGUAGE sql STABLE AS 'SELECT public.digest($1::text, $2::text)';
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea
LANGUAGE sql STABLE AS 'SELECT public.digest($1::bytea, $2::text)';
'@
  docker exec -i $ContainerName psql -U postgres -c $shim | Out-Null

  Write-Host "[runner] preparing canonical schema"
  $schema = @"
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
"@
  docker exec -i $ContainerName psql -U postgres -c $schema | Out-Null

  Write-Host "[runner] applying base migration 20260729103000"
  docker cp "$MigrationsDir/20260729103000_durable_marison_outbound_dispatch.sql" "$ContainerName`:/tmp/m001.sql"
  docker exec $ContainerName psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m001.sql
  if ($LASTEXITCODE -ne 0) { throw "base migration failed" }

  Write-Host "[runner] applying replacement migration 20260803120000"
  docker cp "$MigrationsDir/20260803120000_marison_outbound_replacement_jobs.sql" "$ContainerName`:/tmp/m002.sql"
  docker exec $ContainerName psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m002.sql
  if ($LASTEXITCODE -ne 0) { throw "replacement migration failed" }

  Write-Host "[runner] applying fix migration 20260805090000"
  docker cp "$MigrationsDir/20260805090000_fix_generation_aware_idempotency_key.sql" "$ContainerName`:/tmp/m003.sql"
  docker exec $ContainerName psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/m003.sql
  if ($LASTEXITCODE -ne 0) { throw "fix migration failed" }

  Write-Host "[runner] running integration test"
  docker cp "$TestFile" "$ContainerName`:/tmp/test.sql"
  docker exec $ContainerName psql -U postgres --variable ON_ERROR_STOP=1 -f /tmp/test.sql
  if ($LASTEXITCODE -ne 0) { throw "integration test failed" }

  Write-Host "[runner] integration test PASSED"
} catch {
  Write-Host "[runner] FAILED: $($_.Exception.Message)"
  exit 1
} finally {
  Write-Host "[runner] removing container $ContainerName"
  docker rm -f $ContainerName | Out-Null
}
