import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(migration).toContain("'user'::public.user_role");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toContain("raw_user_meta_data->>'role'");
    expect(migration).not.toContain("raw_user_meta_data->>'department_id'");
    expect(migration).toContain("errcode = '42501'");
  });

  it("protects entity and office writes with the canonical admin helper", () => {
    expect(migration).toContain("alter table if exists public.master_entities enable row level security");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'master_entities'");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'profiles'");
    expect(migration).toContain("where schemaname = 'public' and tablename = 'master_offices'");
    expect(migration.match(/public\.is_current_user_admin\(\)/g)?.length).toBeGreaterThanOrEqual(12);
    expect(migration).not.toContain("super_admin");
  });

  it("requires active non-deleted admins in the server and browser", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    const app = read("src/App.tsx");
    expect(runtime).toContain('.select("role, is_active, deleted_at")');
    expect(runtime).toContain("const isActiveAdminProfile = (profile)");
    expect(runtime).toContain("profile.is_active !== false");
    expect(runtime).toContain("profile.deleted_at == null");
    expect(runtime).not.toContain('profile?.role === "super_admin"');
    expect(runtime.match(/isActiveAdminProfile\(/g)?.length).toBe(5);
    expect(runtime.match(/\.select\("role, is_active, deleted_at"\)/g)?.length).toBeGreaterThanOrEqual(5);
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
});
