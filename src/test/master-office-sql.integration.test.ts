import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.MASTER_OFFICE_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const exe = (name: string) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const read = (name: string) => readFileSync(resolve("supabase/migrations", name), "utf8");
const migration = read("20261009093000_master_office_hierarchy_and_realtime.sql");
const canonical = read("20260923120000_production_marison_master_sync.sql");
const review = canonical.slice(canonical.indexOf("create or replace function public.refresh_marison_office_review()"),
  canonical.indexOf("create or replace function public.refresh_marison_profile_review()"));
const hardening = read("20260728110000_auth_07_privilege_escalation_hardening.sql");
const adminGuard = hardening.slice(0, hardening.indexOf("create or replace function public.enforce_active_profile_request()"));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let directory = "";
let port = 0;
let started = false;
const run = (name: string, args: string[], input = "", ignore = false) => {
  const result = spawnSync(exe(name), args, { input, encoding: "utf8", timeout: 60000,
    windowsHide: true, ...(ignore ? { stdio: "ignore" as const } : {}) });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `${name} failed`);
  return result.stdout || "";
};
const sql = (input: string) => run("psql", ["-X", "-h", "127.0.0.1", "-p", String(port),
  "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], input);
const asUser = (n: number, input: string) => sql(`set role authenticated; set request.jwt.claim.sub='${id(n)}'; ${input}`);
const save = (n: number, kind: string, parent: number | null, create = false) =>
  `select public.save_master_office('${id(n)}','OFF${n}','Office ${n}',null,'${kind}',${parent === null ? "null" : `'${id(parent)}'`},${n},${create});`;

describe.skipIf(!existsSync(exe("initdb")))("master parity disposable PostgreSQL", () => {
  beforeAll(async () => {
    port = await new Promise<number>((done) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const value = typeof address === "object" && address ? address.port : 0;
        server.close(() => done(value));
      });
    });
    directory = mkdtempSync(join(tmpdir(), "sigap-master-parity-pg-"));
    run("initdb", ["-D", join(directory, "data"), "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-w", "start",
      "-o", `-h 127.0.0.1 -p ${port} -c wal_level=logical`], "", true);
    started = true;
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.master_offices(id uuid primary key default gen_random_uuid(),code text unique,name text,email text,
        kedudukan text,parent_id uuid references public.master_offices,
        marison_branch_id bigint,marison_hierarchy_confirmed boolean default true,
        marison_review_required boolean default false,marison_review_reasons text[] default '{}');
      create table public.master_projects(id uuid primary key,name text);
      create table public.marison_sync_issues(id uuid primary key,details jsonb);
      create table public.profiles(id uuid primary key,role text default 'user',is_active boolean default true,
        deleted_at timestamptz,job_title text,office_id uuid,department_id uuid,parent_id uuid);
      create table public.activity_logs(table_name text,action text,record_id text,old_values jsonb,new_values jsonb);
      ${adminGuard}
      alter table public.master_offices enable row level security;
      alter table public.master_projects enable row level security;
      alter table public.marison_sync_issues enable row level security;
      alter table public.profiles enable row level security;
      grant select,insert,update on public.master_offices to authenticated;
      grant select on public.master_projects,public.marison_sync_issues,public.profiles to authenticated;
      create policy offices_read on public.master_offices for select to authenticated using(true);
      create policy offices_write on public.master_offices for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
      create policy projects_read on public.master_projects for select to authenticated using(true);
      create policy directory_read on public.profiles for select to authenticated using(true);
      -- Deliberately broad drift: the forward restrictive policy must defeat this.
      create policy issues_read on public.marison_sync_issues for select to authenticated using(true);
      ${review}
      insert into public.master_offices(id,code,name,kedudukan,parent_id,marison_branch_id,marison_hierarchy_confirmed) values
        ('${id(1)}','KC','Branch','KC',null,1,true),('${id(2)}','HQ','Headquarters','Pusat','${id(1)}',2,false);
      insert into public.profiles(id,role) values ('${id(100)}','admin'),('${id(101)}','user');
      insert into public.marison_sync_issues values('${id(99)}','{"employee_email":"private@example.test"}');
      create publication supabase_realtime for table public.profiles;
      ${read("20261008140000_dynamic_branch_reporting.sql")}
      ${read("20261008150000_dynamic_branch_reporting_preserve_kost.sql")}
      ${read("20261008160000_dynamic_branch_reporting_officer_fallback.sql")}
      create table preserved_org as select tgname,pg_get_triggerdef(oid) definition from pg_trigger
        where tgrelid='public.master_offices'::regclass and tgname in('a_org_reporting_lock','org_reporting_refresh');
      create table preserved_functions as select oid,pg_get_functiondef(oid) definition from pg_proc
        where pronamespace='organization_internal'::regnamespace;
      ${migration}
    `);
  }, 60000);
  afterAll(() => {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"], "", true);
    if (directory) {
      const parent = resolve(tmpdir());
      const child = resolve(directory);
      if (!relative(parent, child).startsWith("..") && child !== parent && child.startsWith(join(parent, "sigap-master-parity-pg-"))) {
        rmSync(child, { recursive: true, force: true });
      }
    }
  });
  it("normalizes existing HQ, preserves topology definitions, and is migration-idempotent", () => {
    sql(migration);
    expect(sql(`select parent_id is null and marison_hierarchy_confirmed and not marison_review_required from public.master_offices where id='${id(2)}';`).trim()).toBe("t");
    expect(sql(`select count(*) from preserved_org old join pg_trigger t using(tgname) where t.tgrelid='public.master_offices'::regclass and old.definition<>pg_get_triggerdef(t.oid);`).trim()).toBe("0");
    expect(sql(`select count(*) from preserved_functions old join pg_proc p using(oid) where old.definition<>pg_get_functiondef(p.oid);`).trim()).toBe("0");
    expect(sql("select string_agg(tablename,',' order by tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';").trim())
      .toBe("marison_sync_issues,master_offices,master_projects");
  });
  it("denies user/anonymous/inactive admins and hides employee issue payloads", () => {
    expect(() => asUser(101, save(3, "Pusat", null, true))).toThrow();
    expect(() => sql(`set role anon; ${save(3, "Pusat", null, true)}`)).toThrow();
    expect(asUser(101, "select count(*) from public.marison_sync_issues;").trim().split("\n").at(-1)).toBe("0");
    expect(asUser(100, "select count(*) from public.marison_sync_issues;").trim().split("\n").at(-1)).toBe("1");
    sql(`update public.profiles set is_active=false where id='${id(100)}';`);
    expect(() => asUser(100, save(3, "Pusat", null, true))).toThrow();
    expect(asUser(100, "select count(*) from public.marison_sync_issues;").trim().split("\n").at(-1)).toBe("0");
    sql(`update public.profiles set is_active=true where id='${id(100)}';`);
  });
  it("RPC/direct writes normalize HQ; unchanged retries do not write twice", () => {
    asUser(100, save(3, "Pusat", 1, true));
    const version = sql(`select xmin from public.master_offices where id='${id(3)}';`).trim();
    asUser(100, save(3, "Pusat", 1, true));
    expect(sql(`select xmin from public.master_offices where id='${id(3)}';`).trim()).toBe(version);
    expect(() => asUser(100, save(3, "KC", 1, true))).toThrow();
    expect(() => asUser(100, save(999, "KC", null))).toThrow();
    sql(`update public.master_offices set parent_id='${id(1)}',marison_hierarchy_confirmed=false where id='${id(3)}';`);
    expect(sql(`select parent_id is null and marison_hierarchy_confirmed from public.master_offices where id='${id(3)}';`).trim()).toBe("t");
  });
  it("requires valid KCP/Kost parents, rejects cycles/orphans, permits unconfirmed sync rows", () => {
    for (const kind of ["KCP", "Kost"]) expect(() => asUser(100, save(4, kind, null, true))).toThrow();
    expect(() => asUser(100, save(4, "KCP", 2, true))).toThrow();
    expect(() => asUser(100, save(4, "KCP", 999, true))).toThrow();
    asUser(100, save(4, "KCP", 1, true));
    expect(() => asUser(100, save(1, "KC", 4))).toThrow();
    sql(`insert into public.master_offices(id,code,name,kedudukan,marison_branch_id,marison_hierarchy_confirmed) values('${id(5)}','SYNC','Unconfirmed','KCP',5,false);`);
    expect(sql(`select marison_review_required from public.master_offices where id='${id(5)}';`).trim()).toBe("t");
  });
  it("office topology changes still reconcile dynamic parents failclosed", () => {
    sql(`insert into public.profiles(id,job_title,office_id) values('${id(10)}','Branch Manager','${id(1)}'),('${id(11)}','Staff','${id(4)}');`);
    expect(sql(`select parent_id='${id(10)}' from public.profiles where id='${id(11)}';`).trim()).toBe("t");
    asUser(100, save(1, "Pusat", 4));
    expect(sql(`select parent_id is null from public.profiles where id='${id(11)}';`).trim()).toBe("t");
  });
  it("fails closed before changing an unexpected/unprotected catalog", () => {
    sql("alter table public.master_projects disable row level security;");
    expect(() => sql(migration)).toThrow(/Unknown or unprotected master catalog/);
    sql("alter table public.master_projects enable row level security;");
    expect(sql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='profiles';").trim()).toBe("0");
  });
});
