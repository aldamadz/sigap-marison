import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260930150000_letter_number_reuse_policy.sql", "utf8");

describe("letter number reuse policy migration", () => {
  it("creates a single-active reuse policy table with a bounded value", () => {
    expect(migration).toContain("letter_number_reuse_policies");
    expect(migration).toContain("unit text not null check (unit in ('hours', 'days'))");
    expect(migration).toContain("value integer not null check (value > 0 and value <= 3650)");
    expect(migration).toContain("where is_active"); // one-active partial unique index
  });

  it("snapshots the window on the reservation at void time", () => {
    expect(migration).toContain("voided_at timestamptz");
    expect(migration).toContain("reuse_until timestamptz");
    expect(migration).toContain("reused_count integer not null default 0");
    expect(migration).toContain("last_reused_at timestamptz");
    expect(migration).toContain("reuse_until = now() + coalesce(public.get_letter_number_reuse_window(), interval '0')");
  });

  it("reclaims only in-window VOID numbers and never USED/historical VOID", () => {
    expect(migration).toContain("claim_reusable_letter_number");
    expect(migration).toContain("and r.status = 'VOID'");
    expect(migration).toContain("and r.voided_at is not null");
    expect(migration).toContain("and r.reuse_until > p_reserved_at");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("for update"); // row lock so one number can't be claimed twice
  });

  it("is forward-only: no DROP of live objects, no edit of applied migrations", () => {
    expect(migration).not.toMatch(/drop table\s+public\.(surat_reservations|letter_number_counter_configs)/i);
    expect(migration).not.toContain("alter table public.surat_reservations drop column");
    expect(migration).toMatch(/create or replace function public\.generate_new_letter_number/g);
  });

  it("never resurrects historic VOID rows and keeps USED permanent", () => {
    // No path sets USED -> VOID; reclaim only touches VOID rows.
    expect(migration).not.toMatch(/set status = 'VOID'\s+where .*status = 'USED'/i);
    // reuse_until IS NULL (historic) rows are excluded because of the
    // `voided_at is not null and reuse_until > now` guard.
    expect(migration).toContain("and r.reuse_until > p_reserved_at");
  });

  it("keeps counter-start changes from clobbering occupied numbers", () => {
    // Insert-new branch still uses max(no_urut)+1; reclaim targets VOID only.
    expect(migration).toContain("coalesce(max(no_urut), 0) + 1");
    expect(migration).toMatch(/claim_reusable_letter_number/g);
  });

  it("void text no longer claims the number is immediately burned", () => {
    const form = readFileSync("src/components/surat/SuratForm.tsx", "utf8");
    expect(form).toContain("dapat dipakai ulang oleh pengajuan lain selama masa berlaku yang diatur admin");
    expect(form).not.toContain("tidak dipakai untuk pengajuan ini");
  });
});
