import { describe, expect, it } from "vitest";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";

const baseSurat = {
  id: "surat-1",
  no_surat: "001/TEST/VIII/2026",
  judul_surat: "Rekomendasi Komputer SET",
  form_input_data: {
    linked_document_type: "recommendation",
    request_category: "asset",
    recommendation_items: [{
      parent_item_id: "computer-set",
      parent_item_index: 1,
      nama_barang: "Prosesor",
      recommendation_action: "ganti",
      recommendation_attachment: {
        draft_file_id: "recommendation-file",
        file_url: "draft/recommendation.png",
      },
    }],
  },
  surat_attachments: [
    {
      id: "initial-file",
      file_name: "surat-kuasa.pdf",
      file_url: "draft/surat-kuasa.pdf",
      stage: "initial",
      requirement_key: "surat_kuasa",
      requirement_label: "Surat Kuasa",
    },
    {
      id: "recommendation-file",
      file_name: "recommendation.png",
      file_url: "draft/recommendation.png",
      stage: "recommendation_item",
      requirement_key: "recommendation_item_1",
      requirement_label: "Lampiran gambar rekomendasi item 1",
    },
  ],
};

describe("registration summary attachment classification", () => {
  it("keeps recommendation image on its item without duplicating it as a general attachment", () => {
    const summary = buildRegistrationSummaryData(baseSurat);
    expect(summary.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "recommendation_items" }),
    ]));
    expect(summary.attachments).toEqual([
      expect.objectContaining({ id: "initial-file", name: "surat-kuasa.pdf" }),
    ]);
  });

  it("keeps legacy ordinary attachments without a stage compatible", () => {
    const summary = buildRegistrationSummaryData({
      ...baseSurat,
      surat_attachments: [{
        id: "legacy-file",
        file_name: "legacy.pdf",
        file_url: "draft/legacy.pdf",
        stage: null,
        requirement_key: "surat_kuasa",
      }],
    });
    expect(summary.attachments).toEqual([
      expect.objectContaining({ id: "legacy-file", name: "legacy.pdf" }),
    ]);
  });
});
