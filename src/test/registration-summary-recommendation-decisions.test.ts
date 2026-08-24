import { describe, expect, it } from "vitest";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";

describe("registration summary canonical recommendation decisions", () => {
  it("keeps recommended items visible and shows a quantity adjustment", () => {
    const summary = buildRegistrationSummaryData({
      id: "request-041",
      no_surat: "041/UAI/MKT.1/VIII/2026",
      form_input_data: {
        request_category: "asset",
        items: [
          { nama_barang: "Meja Gaming", jumlah: "2", sat: "unit" },
          { nama_barang: "Kursi Gaming", jumlah: "2", sat: "unit" },
        ],
      },
      data_snapshot: {
        recommendation_decisions: [
          {
            id: "generated-parent-meja",
            order: 0,
            status: "recommended",
            applicant_original: { name: "Meja Gaming", quantity: 2 },
            details: [{ id: "detail-meja", order: 0, name: "Meja Gaming", quantity: 1, notes: "Disetujui satu" }],
          },
          {
            id: "generated-parent-kursi",
            order: 1,
            status: "recommended",
            applicant_original: { name: "Kursi Gaming", quantity: 2 },
            details: [{ id: "detail-kursi", order: 0, name: "Kursi Gaming", quantity: 2, notes: "Disetujui dua" }],
          },
        ],
      },
      surat_attachments: [],
    });

    const rows = summary.fields.find((field) => field.key === "items")?.value as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      nama_barang: "Meja Gaming",
      __revision: {
        action: "adjust",
        nilai_diajukan: 2,
        nilai_disetujui: 1,
        value_type: "number",
        alasan: "Disetujui satu",
      },
    });
    expect(rows[1]).toMatchObject({
      nama_barang: "Kursi Gaming",
      __recommendation_decision: expect.objectContaining({ status: "recommended" }),
    });
    expect(rows[1]).not.toHaveProperty("__revision");
  });
});
