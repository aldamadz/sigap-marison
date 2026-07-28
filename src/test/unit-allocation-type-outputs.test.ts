import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("unit allocation type outputs", () => {
  it("keeps type available in allocation input, spreadsheet, and vendor payload", () => {
    const inbox = read("src/pages/surat/InboxPage.tsx");
    const excel = read("src/lib/excel.ts");
    const server = read("backend/src/domain-runtime.ts");

    expect(inbox).toContain("Tipe Unit</th>");
    expect(inbox).toContain('["Tipe Unit", "Tipe", "Type", "Unit Type"]');
    expect(excel).toContain('{ header: "Tipe Unit", key: "Tipe Unit"');
    expect(server).toContain("detail.unit_type");
  });

  it("renders type in both generated allocation PDFs and summary PDF", () => {
    const service = read("src/services/surat.service.ts");
    const inbox = read("src/pages/surat/InboxPage.tsx");

    expect(service).toContain('head: [["No", "Kavling", "Tipe"');
    expect(service).toContain('head: [["No", "Proyek", "Unit", "Tipe", "Kode Produksi"]]');
    expect(inbox).toContain('head: [["No.", "Kavling", "Tipe", "Kode Produksi"');
  });

  it("renders type in screen summaries and notification email", () => {
    const summary = read("src/components/surat/UnitAllocationSummary.tsx");
    const server = read("backend/src/domain-runtime.ts");

    expect(summary.match(/>Tipe<\/th>/g)).toHaveLength(2);
    expect(server).toContain(">Tipe</th>");
    expect(server).toContain("getEmailUnitType(unit)");
  });
});
