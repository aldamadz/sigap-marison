import { describe, expect, it } from "vitest";
import { resolveFinalMarisonPdfPath } from "../../backend/src/lib/marison-final-pdf";

const signed = (stepOrder: number, pdfPath: string | null) => ({
  step_order: stepOrder,
  is_signed: true,
  signed_at: `2026-08-24T0${stepOrder}:00:00.000Z`,
  pdf_path_snap: pdfPath,
});

describe("Marison final PDF readiness", () => {
  it("prefers the canonical surat PDF pointer", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "DONE",
      pdf_path: "dokumen_surat/final/document.pdf",
      surat_signatures: [signed(1, "dokumen_surat/signatures/step-1.pdf")],
    })).toBe("dokumen_surat/final/document.pdf");
  });

  it("uses the highest signed step snapshot when a final native document has no surat PDF pointer", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "DONE",
      pdf_path: null,
      surat_signatures: [
        signed(2, "dokumen_surat/signatures/step-2.pdf"),
        signed(1, "dokumen_surat/signatures/step-1.pdf"),
        signed(3, "dokumen_surat/signatures/step-3.pdf"),
      ],
    })).toBe("dokumen_surat/signatures/step-3.pdf");
  });

  it("does not expose a signature snapshot before the document is final", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "PROSES",
      pdf_path: null,
      surat_signatures: [signed(1, "dokumen_surat/signatures/step-1.pdf")],
    })).toBeNull();
  });

  it("does not expose a signature snapshot while any configured signature is incomplete", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "DONE",
      pdf_path: null,
      surat_signatures: [
        signed(1, "dokumen_surat/signatures/step-1.pdf"),
        { step_order: 2, is_signed: false, signed_at: null, pdf_path_snap: null },
      ],
    })).toBeNull();
  });

  it("does not fall back to an older snapshot when the final step PDF is missing", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "DONE",
      pdf_path: null,
      surat_signatures: [
        signed(1, "dokumen_surat/signatures/step-1.pdf"),
        signed(2, null),
      ],
    })).toBeNull();
  });

  it("requires at least one configured signature for snapshot fallback", () => {
    expect(resolveFinalMarisonPdfPath({
      status: "DONE",
      pdf_path: null,
      surat_signatures: [],
    })).toBeNull();
  });
});
