import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSuratNavigationTone } from "@/components/layout/surat-navigation-tone";

describe("Layanan Surat SLA navigation tone", () => {
  it("is green-safe with no active overdue task and red with any overdue task", () => {
    expect(getSuratNavigationTone(0)).toBe("safe");
    expect(getSuratNavigationTone(1)).toBe("overdue");
    expect(getSuratNavigationTone(9)).toBe("overdue");
  });

  it("queries only active pending SLA breaches and refreshes on signature changes", () => {
    const runtime = readFileSync("backend/src/domain-runtime.ts", "utf8");
    const provider = readFileSync("src/providers/AttentionProvider.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260814120000_user_active_sla_breach_count.sql",
      "utf8",
    );

    expect(runtime).toContain('.rpc("get_user_active_sla_breach_count"');
    expect(runtime).toContain("overdueSlaCount:");
    expect(migration).toContain("signature.is_signed = false");
    expect(migration).toContain("surat.status = 'PROSES'");
    expect(migration).toContain("signature.step_order = surat.current_step");
    expect(migration).toContain(") > coalesce(config.sla_minutes, 120)");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
    expect(provider).toContain('table: "surat_signatures"');
  });

  it("uses the same safe or overdue tone for the section and active surat tab", () => {
    const sidebar = readFileSync("src/components/layout/Sidebar.tsx", "utf8");

    expect(sidebar).toContain("suratNavigationToneClasses[suratNavigationTone]");
    expect(sidebar).toContain("isActive && isSuratSubItem");
    expect(sidebar).toContain("Layanan Surat -");
  });
});
