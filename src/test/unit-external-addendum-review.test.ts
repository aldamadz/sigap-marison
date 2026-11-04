import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261104160000_preserve_external_unit_addendum_review.sql");

describe("SUR-30 preserved external addendum review", () => {
  it("retains the original exact review and only adds a private provenance path", () => {
    expect(migration).toContain("has_valid_review_pre_external_addendum(p_surat_id,p_input)");
    expect(migration).toContain("has_preserved_external_addendum_review(p_surat_id,p_input)");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).not.toMatch(/update public\.|delete from public\.|insert into public\./i);
  });

  it("binds unchanged allocation evidence to the current resolved external generation", () => {
    for (const clause of [
      "d.form_input_data=p_input", "e.status='resolved'", "e.resolved_by is not null",
      "decision.decision='revision_required'", "archive.decision_event_id=decision.id",
      "{external_revision_current,revision_event_id}", "{external_revision_current,generation}",
      "s.verified_by=h.actor_id", "s.verified_at=h.verified_at", "s.is_signed is true",
      "archive.document_snapshot#>'{form_input_data,allocated_units}'=p_input->'allocated_units'",
      "later.revision_generation>archive.generation",
    ]) expect(migration).toContain(clause);
  });

  it("excludes only financial fields from the preserved allocation comparison", () => {
    expect(migration).toContain("(u.value->'allocation_detail')-'struktur_atas'-'struktur_bawah'");
    expect(migration).toContain("order by u.ordinality");
    expect(migration).toContain("preserved.value->'verified_at'=to_jsonb(h.verified_at)");
    expect(migration).toContain("nullif(trim(preserved.value->>'verification_note'),'') is not distinct from h.note");
  });

  it("runs real PostgreSQL regressions for both deployment shapes", () => {
    const gate = read("scripts/test-changed.mjs");
    expect(gate).toContain("gates.add('unit-external-addendum-sql')");
    expect(gate).toContain("['scripts/test-unit-revision-reallocation-sql.mjs', '--external-addendum']");
    expect(gate).toContain("['scripts/test-unit-revision-reallocation-sql.mjs', '--external-addendum', '--production-shape']");
    expect(read("supabase/tests/unit_external_addendum_review.integration.sql")).toContain("Original immutable review changed");
  });
});
