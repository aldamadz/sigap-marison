import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260812135500_fix_recommendation_internal_number_reservation.sql",
  "utf8",
);

describe("recommendation internal number reservation", () => {
  it("does not impersonate the requester through the public numbering RPC", () => {
    expect(migration).not.toContain("public.generate_new_letter_number(");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("insert into public.surat_reservations");
    expect(migration).toContain("'PENDING', v_actor");
  });

  it("keeps the public recommendation task authorization unchanged", () => {
    expect(migration).toContain("v_parent.created_by = v_actor");
    expect(migration).toContain("v_parent.represented_by_admin = v_actor");
    expect(migration).toContain("profile.role::text = 'admin'");
    expect(migration).toContain(
      "grant execute on function public.create_recommendation_task_for_parent(uuid) to authenticated, service_role",
    );
  });
});
