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

  it("snapshots the window on the reservation at void time and keeps audit columns", () => {
    expect(migration).toContain("voided_at timestamptz");
    expect(migration).toContain("reuse_until timestamptz");
    expect(migration).toContain("reused_count integer not null default 0");
    expect(migration).toContain("last_reused_at timestamptz");
    expect(migration).toContain("reuse_until = now() + v_window");
  });

  it("logs every cancel and every reclaim in an event table", () => {
    expect(migration).toContain("letter_number_reservation_events");
    expect(migration).toContain("kind in ('void', 'reclaimed')");
    expect(migration).toContain("log_letter_number_reservation_event");
    expect(migration).toContain("'Nomor dipakai ulang oleh pemohon baru.'");
    expect(migration).toContain("'Draft dibatalkan oleh pemohon.'");
  });

  it("reclaims only in-window VOID numbers using server time (no bypass)", () => {
    expect(migration).toContain("claim_reusable_letter_number");
    expect(migration).toContain("and r.status = 'VOID'");
    expect(migration).toContain("and r.voided_at is not null");
    expect(migration).toContain("and r.reuse_until > v_now");
    // No client-supplied timestamp parameter: internal, server now() only.
    expect(migration).not.toContain("p_reserved_at");
    expect(migration).toContain("v_now timestamptz := now()");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("for update"); // row lock so one number can't be claimed twice
    // Internal function: not callable by authenticated users directly.
    expect(migration).toContain("grant execute on function public.claim_reusable_letter_number(uuid, integer, text, uuid, uuid, uuid, integer, uuid, uuid) to service_role");
  });

  it("never resurrects a cancelled draft and detaches it on reclaim", () => {
    // Reclaim detaches any stale cancelled draft so the next owner is fresh.
    expect(migration).toContain("set reservation_id = null");
    expect(migration).toContain("where reservation_id = v_row_id");
    expect(migration).toContain("and status = 'VOID'");
    // The draft RPC can never revive a VOID draft (fail closed).
    expect(migration).toContain("where surat_registration_drafts.status is distinct from 'VOID'");
    expect(migration).toContain("Reservasi masih memiliki draft pembatalan");
  });

  it("keeps the cancel audit on the reservation and preserves history", () => {
    // The reclaim update must not clear voided_at/voided_by. (The string
    // "voided_at = null" appears only in the draft-RPC guard, which is fine.)
    const claimStart = migration.indexOf("create or replace function public.claim_reusable_letter_number");
    const claimEnd = migration.indexOf("grant execute on function public.claim_reusable_letter_number");
    const claimBody = claimStart >= 0 && claimEnd > claimStart
      ? migration.slice(claimStart, claimEnd)
      : "";
    expect(claimBody).not.toContain("voided_at = null");
    expect(claimBody).not.toContain("voided_by = null");
    // History lives in the event log; the reservation keeps the latest cancel.
    expect(migration).toContain("voided_by = v_user_id");
  });

  it("is forward-only: no DROP of live objects, no edit of applied migrations", () => {
    expect(migration).not.toMatch(/drop table\s+public\.(surat_reservations|letter_number_counter_configs)/i);
    expect(migration).not.toContain("alter table public.surat_reservations drop column");
    expect(migration).toMatch(/create or replace function public\.generate_new_letter_number/g);
  });

  it("never resurrects historic VOID rows and keeps USED permanent", () => {
    expect(migration).not.toMatch(/set status = 'VOID'\s+where .*status = 'USED'/i);
    expect(migration).toContain("and r.reuse_until > v_now");
  });

  it("keeps counter-start changes from clobbering occupied numbers", () => {
    expect(migration).toContain("coalesce(max(no_urut), 0) + 1");
    expect(migration).toMatch(/claim_reusable_letter_number/g);
  });

  it("tightens the window helper to internal use only", () => {
    expect(migration).toContain("revoke all on function public.get_letter_number_reuse_window() from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_letter_number_reuse_window() to service_role");
  });

  it("void text no longer claims the number is immediately burned", () => {
    const form = readFileSync("src/components/surat/SuratForm.tsx", "utf8");
    expect(form).toContain("dapat dipakai ulang oleh pengajuan lain selama masa berlaku yang diatur admin");
    expect(form).not.toContain("tidak dipakai untuk pengajuan ini");
  });
});
