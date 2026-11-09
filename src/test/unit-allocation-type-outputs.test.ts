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
    expect(inbox).toContain('placeholder="Isi tipe unit"');
    expect(inbox).toContain('applyExternalUnitReference(unit, detail).unit_type');
    expect(excel).toContain('{ header: "Tipe Unit", key: "Tipe Unit"');
    expect(excel).toContain("Nilai awal dari external; dapat diperbarui pemeriksa.");
    expect(server).toContain("type: unitType");
    expect(inbox).toContain('...(typeIndex >= 0 ? { unit_type: String(row[typeIndex] ?? "").trim() } : {})');
    expect(inbox).not.toContain('readOnly={Boolean(getExternalUnitReference(unit)');
    expect(inbox).not.toContain('disabled={Boolean(getExternalUnitReference(unit).date)}');
  });

  it("renders type in both generated allocation PDFs and summary PDF", () => {
    const service = read("src/services/surat.service.ts");
    const pdfBuilders = read("src/services/surat/pdf-builders.ts");
    const inbox = read("src/pages/surat/InboxPage.tsx");

    expect(pdfBuilders).toContain('head: [["No", "Kavling", "Tipe"');
    expect(pdfBuilders).toContain('head: [["No", "Proyek", "Unit", "Tipe", "Kode Produksi"]]');
    // The suratService facade still delegates to the new module so the
    // legacy literal remains available through the public service surface.
    expect(service).toContain("createUnitRecapAttachment(...args: Parameters<typeof createUnitRecapAttachment>)");
    expect(service).toContain("createProductionCodeAttachment(...args: Parameters<typeof createProductionCodeAttachment>)");
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
