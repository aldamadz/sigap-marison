import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isActiveAdminProfile, isActiveProfile } from "../../backend/src/domain/profile-authorization.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260728110000_auth_07_privilege_escalation_hardening.sql");

describe("AUTH-07 privilege escalation controls", () => {
  it("blocks self-service writes to sensitive profile fields", () => {
    expect(migration).toContain("before update on public.profiles");
    expect(migration).toContain("to_jsonb(new) - allowed_fields");
    expect(migration).toContain("create policy profiles_insert_admin");
    expect(migration).not.toContain("'email'");
    expect(migration).not.toContain("'created_at'");
    expect(migration).toContain("create or replace function public.handle_new_user()");
    expect(migration).toContain("create or replace function public.is_current_user_admin()");
    expect(migration).toContain("p.is_active is true");
    expect(migration).toContain("p.deleted_at is null");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("create or replace function public.enforce_active_profile_request()");
    expect(migration).toContain("alter role authenticator set pgrst.db_pre_request");
    expect(migration).toContain("grant execute on function public.enforce_active_profile_request() to anon, authenticated, service_role");
    expect(migration).toContain("revoke execute on function public.handle_new_user() from public, anon, authenticated");
    expect(migration).toContain("'user'::public.user_role");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toContain("raw_user_meta_data->>'role'");
    expect(migration).not.toContain("raw_user_meta_data->>'department_id'");
    expect(migration).toContain("errcode = '42501'");
  });

  it("protects entity and office writes with the canonical admin helper", () => {
    expect(migration).toContain("alter table if exists public.master_entities enable row level security");
    expect(migration).toContain("alter table if exists public.master_offices enable row level security");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'master_entities'");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'profiles'");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'master_offices'");
    expect(migration.match(/public\.is_current_user_admin\(\)/g)?.length).toBeGreaterThanOrEqual(12);
    expect(migration).toContain("drop trigger if exists tr_prevent_profile_privilege_self_update");
    expect(migration).toContain("drop function if exists public.prevent_profile_privilege_self_update()");
    expect(migration).not.toContain("create policy master_offices_admin_delete");
    expect(migration).not.toContain("super_admin");
  });

  it("requires active non-deleted admins in the server and browser", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    const session = read("backend/src/lib/session.ts");
    const authService = read("backend/src/services/auth.service.ts");
    const app = read("src/App.tsx");
    const browserClient = read("src/lib/supabase.ts");
    expect(runtime).toContain('.select("role, is_active, deleted_at")');
    expect(runtime).toContain('from "./domain/profile-authorization.js"');
    expect(runtime).toContain("assertActiveSessionProfile");
    expect(runtime).toContain("if (!isActiveProfile(profile))");
    expect(runtime).toContain("PGRST301");
    expect(runtime).not.toContain('profile?.role === "super_admin"');
    expect(runtime.match(/isActiveAdminProfile\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(runtime.match(/\.select\("role, is_active, deleted_at"\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(session).toContain("requireActiveSessionProfile");
    expect(session).toContain("isActiveProfile(profile)");
    expect(authService.match(/requireActiveSessionProfile\(/g)?.length).toBe(2);
    expect(browserClient).toContain("const refreshSessionState = async () =>");
    expect(browserClient).toContain("notifyAuth('SIGNED_OUT', null)");
    expect(app).toContain("data?.is_active === true");
    expect(app).toContain("data?.deleted_at == null");
    for (const page of [
      "UserManagementPage",
      "OrganizationHierarchyPage",
      "DepartmentManagementPage",
      "EntityManagementPage",
      "LetterTypeManagementPage",
      "OfficeManagementPage",
      "MasterProjectManagementPage",
      "AdminMonitoringPage",
      "DepartmentKPIPage",
      "ConfigurationLayout",
    ]) {
      expect(app).toContain(`<AdminOnlyRoute><${page}`);
    }
  });

  it("fails closed for incomplete, inactive, deleted, and legacy admin profiles", () => {
    expect(isActiveProfile({ is_active: true, deleted_at: null })).toBe(true);
    expect(isActiveProfile({ is_active: false, deleted_at: null })).toBe(false);
    expect(isActiveProfile({ is_active: null, deleted_at: null })).toBe(false);
    expect(isActiveProfile({ deleted_at: null })).toBe(false);
    expect(isActiveAdminProfile({ role: "admin", is_active: true, deleted_at: null })).toBe(true);
    expect(isActiveAdminProfile({ role: "admin", is_active: true, deleted_at: "2026-07-28" })).toBe(false);
    expect(isActiveAdminProfile({ role: "super_admin", is_active: true, deleted_at: null })).toBe(false);
  });
});
