import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("sidebar attention indicators", () => {
  it("maps every actionable sidebar badge to a count and tone", () => {
    const sidebar = read("src/components/layout/Sidebar.tsx");

    [
      "Persetujuan: { count:",
      "Rekomendasi: { count:",
      "'Tindak Lanjut': { count:",
      "'Status Pengajuan': { count:",
      "'User Organization': { count:",
      "'Master Kantor Cabang': { count:",
    ].forEach((mapping) => expect(sidebar).toContain(mapping));
    expect(sidebar).toContain("<SidebarCountBadge count={attention.count} tone={attention.tone} />");
  });

  it("highlights both leaf rows and aggregate parent rows when attention exists", () => {
    const sidebar = read("src/components/layout/Sidebar.tsx");

    expect(sidebar).toContain("attention && 'sidebar-attention-row'");
    expect(sidebar).toContain("suratAttentionCount > 0 && 'sidebar-attention-row'");
    expect(sidebar).toContain("masterReviewCount > 0 && 'sidebar-attention-row'");
    expect(sidebar).toContain("collapsed && attention");
  });

  it("blinks badges and rows while respecting reduced-motion preferences", () => {
    const css = read("src/index.css");

    expect(css).toContain(".sidebar-attention-badge");
    expect(css).toContain("@keyframes sidebar-attention-badge-blink");
    expect(css).toContain("@keyframes sidebar-attention-row-blink");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
