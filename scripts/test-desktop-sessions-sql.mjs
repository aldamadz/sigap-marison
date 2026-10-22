import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const container = `sigap-desktop-test-${randomUUID()}`;
const run = (args, input) => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Docker test failed");
  return result.stdout + result.stderr;
};
try {
  run(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const check = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (check.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not start");
  const migration = readFileSync("supabase/migrations/20261022120000_desktop_notification_sessions.sql", "utf8");
  const assertions = readFileSync("supabase/tests/desktop_notification_sessions.integration.sql", "utf8");
  const seed = `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, encrypted_password text, deleted_at timestamptz, banned_until timestamptz);
    create table public.profiles(id uuid primary key, full_name text, is_active boolean, deleted_at timestamptz);
    create table public.notifications(id uuid primary key, user_id uuid, created_at timestamptz);
    grant usage on schema public to anon, authenticated, service_role;`;
  const output = run(["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], seed + migration + assertions);
  if (!output.includes("Desktop sessions: all assertions passed")) throw new Error("SQL assertion marker absent");
  console.log("Desktop sessions: all assertions passed (PostgreSQL 17)");
  run(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], `
    insert into auth.users(id,encrypted_password) values('10000000-0000-4000-8000-000000000001','test');
    insert into public.profiles(id,full_name,is_active) values('10000000-0000-4000-8000-000000000001','Tester',true);
    insert into public.desktop_pairing_requests(device_code_hash,confirmation_hash,challenge,installation_id,device_name,platform,status,user_id)
    values(repeat('9',64),'confirm','challenge',gen_random_uuid(),'Race','windows','approved','10000000-0000-4000-8000-000000000001');`);
  const race = await Promise.all(["a", "b"].map(async key => {
    const { stdout } = await promisify(execFile)("docker", ["exec", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c",
      `select public.desktop_pair_exchange(repeat('9',64),'challenge',repeat('${key}',64),repeat('${key === "a" ? "c" : "d"}',64));`]);
    return stdout;
  }));
  if (race.filter(value => value.includes('"session_id"')).length !== 1) throw new Error("Concurrent exchange did not have exactly one winner");
  console.log("Concurrent pairing exchange: exactly one winner");
} finally {
  spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
}
