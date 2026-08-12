import { describe, expect, it } from "vitest";
import {
  buildRecommendationMultiDetail,
  recommendationMultiDetailErrors,
  syncRecommendationMultiDetailInput,
} from "@/components/surat/recommendation-multi-detail";

const ids = ["parent-1", "detail-1", "parent-2", "detail-2"];
const idFactory = () => ids.shift() || "fallback";

describe("recommendation multi-detail UI model", () => {
  it("creates one editable detail for every applicant item", () => {
    const model = buildRecommendationMultiDetail([
      { id: "request-a", nama_barang: "Komputer SPV", jumlah: 1, keterangan: "Untuk operasional" },
      { id: "request-b", nama_barang: "Laptop", jumlah: 2 },
    ], undefined, idFactory);

    expect(model.version).toBe(1);
    expect(model.items).toHaveLength(2);
    expect(model.items[0]).toMatchObject({
      id: "request-a",
      status: "recommended",
      applicant_original: { name: "Komputer SPV", quantity: 1 },
      details: [{ name: "Komputer SPV", quantity: 1, action: "purchase_new", description: "Pembelian baru" }],
    });
  });

  it("syncs canonical and legacy payloads without sending rejected parents as recommended details", () => {
    const model = buildRecommendationMultiDetail([
      { id: "request-a", nama_barang: "Komputer SPV", jumlah: 1 },
    ], undefined, idFactory);
    model.items[0] = {
      ...model.items[0],
      status: "not_recommended",
      location: "Kantor Pusat",
      pic: "Aldama",
      rejection_reason: "Perangkat masih layak digunakan",
      details: [],
    };

    const input = syncRecommendationMultiDetailInput({ request_category: "asset" }, model);
    expect(input.recommendation_multi_detail).toEqual(model);
    expect(input.recommendation_items).toEqual([
      expect.objectContaining({
        parent_item_id: "request-a",
        recommendation_action: "tidak_direkomendasikan",
        rejection_reason: "Perangkat masih layak digunakan",
      }),
    ]);
  });

  it("keeps an incomplete rejection editable without running final legacy validation", () => {
    const model = buildRecommendationMultiDetail([
      { id: "request-a", nama_barang: "Komputer SPV", jumlah: 1 },
    ], undefined, idFactory);
    const previousLegacy = [{ nama_barang: "Komputer SPV", recommendation_action: "beli_baru" }];
    model.items[0] = {
      ...model.items[0],
      status: "not_recommended",
      location: "Kantor Pusat",
      pic: "Aldama",
      rejection_reason: "",
    };

    expect(() => syncRecommendationMultiDetailInput({ recommendation_items: previousLegacy }, model)).not.toThrow();
    const input = syncRecommendationMultiDetailInput({ recommendation_items: previousLegacy }, model);
    expect(input.recommendation_multi_detail).toEqual(model);
    expect(input.recommendation_items).toEqual(previousLegacy);
  });

  it("reports operational validation errors per parent and detail", () => {
    const model = buildRecommendationMultiDetail([
      { id: "request-a", nama_barang: "Komputer SPV", jumlah: 1 },
    ], undefined, idFactory);

    expect(recommendationMultiDetailErrors(model)).toEqual(expect.arrayContaining([
      "Item 1: lokasi wajib dipilih.",
      "Item 1: PIC wajib dipilih.",
      "Item 1.1: lampiran gambar wajib ditambahkan.",
    ]));
  });
});
