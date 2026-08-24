import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814113000_sur13_organization_document_access.sql",
  "utf8",
);

describe("SUR-13 organization document access", () => {
  it("grants document access through the organization scope", () => {
    expect(migration).toContain("create or replace function public.can_read_surat");
    expect(migration).toContain("select public.can_monitor_surat_scope(p_surat_id)");
    expect(migration).toContain("actor_office.kedudukan = 'Pusat'");
    expect(migration).toContain(
      "coalesce(surat.represented_department_id, surat.dept_id) = actor_profile.department_id",
    );
    expect(migration).toContain("surat.office_id = actor_profile.office_id");
  });

  it("preserves participant and administrative access", () => {
    expect(migration).toContain("surat.created_by = auth.uid()");
    expect(migration).toContain("signature.user_id = auth.uid()");
    expect(migration).toContain("signature.verifier_snapshot @>");
    expect(migration).toContain("('admin', 'super_admin')");
  });

  it("keeps the predicates non-recursive and fail-closed for inactive actors", () => {
    const monitorBody = migration.slice(
      migration.indexOf("create or replace function public.can_monitor_surat_scope"),
      migration.indexOf("create or replace function public.can_read_surat"),
    );

    expect(monitorBody).not.toContain("public.can_read_surat(");
    expect(monitorBody).toContain("auth.uid() is not null");
    expect(monitorBody).toContain("coalesce(actor_profile.is_active, true) = true");
    expect(monitorBody).toContain("actor_profile.deleted_at is null");
  });

  it("keeps function privileges restricted", () => {
    expect(migration).toContain(
      "revoke all on function public.can_monitor_surat_scope(uuid) from public, anon",
    );
    expect(migration).toContain(
      "revoke all on function public.can_read_surat(uuid) from public, anon",
    );
    expect(migration).toContain("to authenticated, service_role");
  });
});
