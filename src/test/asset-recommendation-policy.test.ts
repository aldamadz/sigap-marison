import { describe, expect, it } from "vitest";
import { canUseAssetRecommendation } from "@/lib/asset-recommendation-policy";
import { suratService } from "@/services/surat.service";

describe("Asset recommendation department policy", () => {
  it("allows only PBO identity aliases", () => {
    expect(canUseAssetRecommendation({ code: "PBO", name: "Pengembangan Organisasi" })).toBe(true);
    expect(canUseAssetRecommendation({ name: "PO" })).toBe(true);
    expect(canUseAssetRecommendation({ code: "MKT", name: "Marketing" })).toBe(false);
    expect(canUseAssetRecommendation({ code: "HRD", name: "HRD & GA" })).toBe(false);
  });

  it("removes recommendation fields from Asset requests outside PBO", () => {
    const normalized = suratService.normalizeFormInputData({
      request_category: "asset",
      requires_recommendation: true,
      recommendation_template_name: "Rekomendasi Peremajaan Alat",
      recommendation_attachment_note: "Harus dibuat",
      items: [{ nama_barang: "Laptop", jumlah: 1 }],
    }, {
      requesterDepartmentCode: "MKT",
      requesterDepartmentName: "Marketing",
    });

    expect(normalized.requires_recommendation).toBeUndefined();
    expect(normalized.recommendation_template_name).toBeUndefined();
    expect(normalized.recommendation_attachment_note).toBeUndefined();
  });
});
