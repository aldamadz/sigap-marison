import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addRecommendationDetail,
  applyRecommendationDescriptionDefault,
  createRecommendationId,
  flattenRecommendationItems,
  readLegacyRecommendationItems,
  removeRecommendationDetail,
  reorderRecommendationDetails,
  setRecommendationDescription,
  type RecommendationDetail,
} from "../../shared/src/recommendation-multi-detail";

const detail = (id: string, order = 0): RecommendationDetail => ({
  id,
  order,
  action: "replace",
  name: `Component ${id}`,
  quantity: 1,
  description: "Ganti komponen",
  description_manually_edited: false,
  notes: "",
  attachments: [],
  reference_links: [],
});

describe("recommendation multi-detail contract", () => {
  it("preserves decimal applicant and component measurements through canonical and flat forms", () => {
    const model = readLegacyRecommendationItems([{ parent_item_id: "measure", parent_item_name: "Kabel", parent_item_quantity: 1.5,
      detail_id: "detail", nama_barang: "Kabel pengganti", jumlah: 0.5, recommendation_action: "replace" }]);
    expect(model.items[0].applicant_original.quantity).toBe(1.5);
    expect(model.items[0].details[0].quantity).toBe(0.5);
    expect(flattenRecommendationItems(model)[0]).toMatchObject({ parent_item_quantity: 1.5, jumlah: 0.5 });
  });
  it("accepts shared canonical v1 fixture without a separate specification field", () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "fixtures/recommendation-multi-detail-v1.json"), "utf8"));
    const model = readLegacyRecommendationItems(fixture.items);
    expect(model).toEqual(fixture);
    expect(model.items[0].details[0]).not.toHaveProperty("specification");
  });
  it("adapts a parent-authoritative recommended decision and canonical actions", () => {
    const model = readLegacyRecommendationItems([{
      parent_item_id: "asset-1",
      detail_id: "detail-1",
      parent_item_name: "Laptop",
      parent_item_quantity: 2,
      parent_item_notes: "For design team",
      nama_barang: "Laptop replacement",
      jumlah: 2,
      recommendation_action: "replace",
    }]);

    expect(model.items[0]).toMatchObject({
      id: "asset-1",
      status: "recommended",
      applicant_original: { name: "Laptop", quantity: 2, notes: "For design team" },
      details: [{ id: "detail-1", action: "replace", name: "Laptop replacement" }],
    });
    expect(flattenRecommendationItems(model)[0]).toMatchObject({
      parent_item_id: "asset-1",
      detail_id: "detail-1",
      recommendation_action: "ganti",
    });
  });

  it("projects canonical head-office location and PIC to the legacy template field", () => {
    const model = readLegacyRecommendationItems([{
      parent_item_id: "asset-1",
      detail_id: "detail-1",
      parent_item_name: "Laptop",
      nama_barang: "Laptop HP",
      recommendation_action: "purchase_new",
      location: "Kantor Pusat / Marketing",
      pic: "Andreas Bayu Darmawan",
    }]);

    expect(flattenRecommendationItems(model)[0]).toMatchObject({
      location: "Kantor Pusat / Marketing",
      pic: "Andreas Bayu Darmawan",
      lokasi_pic: "Marketing / Andreas",
    });
  });

  it("requires recommended parents to contain details", () => {
    expect(() => readLegacyRecommendationItems([{
      id: "asset-1",
      applicant_original: { name: "Laptop", quantity: 1, notes: "" },
      status: "recommended",
      details: [],
    }])).toThrow("at least one detail");
  });

  it.each([
    ["service", "service"], ["servis", "service"], ["replace", "replace"], ["ganti", "replace"],
    ["purchase_new", "purchase_new"], ["beli_baru", "purchase_new"], ["beli baru", "purchase_new"],
  ] as const)("normalizes legacy action alias %s", (alias, action) => {
    expect(readLegacyRecommendationItems([{ nama_barang: "Laptop", jumlah: 1, recommendation_action: alias }])
      .items[0].details[0].action).toBe(action);
  });

  it.each(["not_recommended", "tidak_direkomendasikan", "tidak direkomendasikan", "ditolak", "rejected"])(
    "normalizes legacy rejection alias %s", (alias) => {
      expect(readLegacyRecommendationItems([{
        parent_item_name: "Laptop", recommendation_action: alias, location: "Gudang", pic: "Budi", alasan: "Tidak ekonomis",
      }]).items[0].status).toBe("not_recommended");
    },
  );

  it("allows rejected parents without details and flattens one preserved legacy decision row", () => {
    const model = readLegacyRecommendationItems([{
      parent_item_id: "asset-1",
      parent_item_name: "Laptop",
      jumlah: 2,
      recommendation_action: "tidak_direkomendasikan",
      tidak_direkomendasikan: "Tidak sesuai standar",
      location: "Gudang A",
      pic: "Budi",
      vendor_extension: { code: "X" },
    }]);

    expect(model.items[0]).toMatchObject({
      status: "not_recommended",
      rejection_reason: "Tidak sesuai standar",
      location: "Gudang A",
      pic: "Budi",
      details: [],
    });
    expect(flattenRecommendationItems(model)).toEqual([expect.objectContaining({
      vendor_extension: { code: "X" },
      recommendation_action: "tidak_direkomendasikan",
      is_recommended: false,
      alasan: "Tidak sesuai standar",
      attachments: [],
    })]);
  });

  it("preserves optional rejected-parent details for audit while legacy outbound stays rejected-only", () => {
    const model = readLegacyRecommendationItems([{
      id: "asset-1",
      applicant_original: { name: "Laptop", quantity: 1, notes: "" },
      status: "not_recommended",
      rejection_reason: "Tidak ekonomis",
      location: "Gudang",
      pic: "Budi",
      details: [{ id: "audit-detail", name: "SSD", quantity: 1, recommendation_action: "service" }],
    }]);

    expect(model.items[0].details).toEqual([expect.objectContaining({ id: "audit-detail", action: "service" })]);
    expect(flattenRecommendationItems(model)).toEqual([expect.objectContaining({
      recommendation_action: "tidak_direkomendasikan",
      attachments: [],
    })]);
  });

  it("requires rejected parent reason, location, and PIC", () => {
    const base = { parent_item_name: "Laptop", recommendation_action: "tidak_direkomendasikan" };
    expect(() => readLegacyRecommendationItems([{ ...base, alasan: "No", pic: "Budi" }])).toThrow("location");
    expect(() => readLegacyRecommendationItems([{ ...base, alasan: "No", location: "A" }])).toThrow("PIC");
    expect(() => readLegacyRecommendationItems([{ ...base, location: "A", pic: "Budi" }])).toThrow("rejection_reason");
  });

  it("cautiously reads a legacy rejection reason stored in the decision field", () => {
    const rejected = readLegacyRecommendationItems([{
      parent_item_name: "Laptop",
      tidak_direkomendasikan: "Biaya perbaikan tidak ekonomis",
      location: "Gudang A",
      pic: "Budi",
    }]);
    expect(rejected.items[0]).toMatchObject({
      status: "not_recommended",
      rejection_reason: "Biaya perbaikan tidak ekonomis",
      details: [],
    });

    expect(() => readLegacyRecommendationItems([{
      parent_item_name: "Laptop",
      tidak_direkomendasikan: "false",
    }])).toThrow("valid action");
  });

  it("reads nested details and defaults first missing legacy detail name to immutable original", () => {
    const model = readLegacyRecommendationItems([{
      id: "set-1",
      applicant_original: { name: "Computer set", quantity: 2, notes: "Original request" },
      details: [
        { id: "cpu", recommendation_action: "service", quantity: 1 },
        { id: "monitor", name: "Monitor 27 inch", recommendation_action: "beli_baru", quantity: 1 },
      ],
    }]);

    expect(model.items[0].details.map(({ id, name }) => [id, name])).toEqual([
      ["cpu", "Computer set"],
      ["monitor", "Monitor 27 inch"],
    ]);
    expect(Object.isFrozen(model.items[0].applicant_original)).toBe(true);
  });

  it("keeps stable IDs and explicit order through add, remove, and reorder", () => {
    const parent = readLegacyRecommendationItems([
      { parent_item_id: "p", parent_item_name: "Set", detail_id: "one", nama_barang: "One", recommendation_action: "service" },
      { parent_item_id: "p", parent_item_name: "Set", detail_id: "two", nama_barang: "Two", recommendation_action: "service" },
    ]).items[0];
    const added = addRecommendationDetail(parent, detail("three", 2));
    const reordered = reorderRecommendationDetails(added, ["three", "one", "two"]);
    const removed = removeRecommendationDetail(reordered, "one");

    expect(removed.details.map(({ id, order }) => [id, order])).toEqual([["three", 0], ["two", 2]]);
    expect(() => removeRecommendationDetail({ ...parent, details: [detail("only")] }, "only")).toThrow("at least one detail");
  });

  it("uses action-owned Indonesian defaults only until manually edited", () => {
    const initial = detail("one");
    const defaulted = applyRecommendationDescriptionDefault(initial, "service");
    const edited = setRecommendationDescription(defaulted, "Catatan teknisi");

    expect(defaulted).toMatchObject({ action: "service", description: "Servis" });
    expect(applyRecommendationDescriptionDefault(edited, "purchase_new").description).toBe("Catatan teknisi");
    expect(edited.description_manually_edited).toBe(true);
  });

  it("reads checkmarks plus singular, flat, and array attachments while preserving unknown fields", () => {
    const legacy = [{
      nama_barang: "Printer",
      jumlah: 1,
      beli_baru: "✓",
      vendor_extension: { code: "X" },
      attachments: [
        { id: "image-b", order: 2, caption: "Back", file_url: "draft/back.jpg", custom: true },
        { id: "image-a", order: 1, caption: "Front", storage_path: "draft/front.jpg" },
      ],
      reference_link: "https://example.test/manual",
    }];
    const first = readLegacyRecommendationItems(legacy);
    const second = readLegacyRecommendationItems([...legacy].reverse());

    expect(second.items[0].id).toBe(first.items[0].id);
    expect(second.items[0].details[0].id).toBe(first.items[0].details[0].id);
    expect(first.items[0].details[0].attachments.map(({ id }) => id)).toEqual(["image-a", "image-b"]);
    const [flat] = flattenRecommendationItems(first);
    expect(flat.vendor_extension).toEqual({ code: "X" });
    expect((flat.attachments as Array<Record<string, unknown>>)[1].custom).toBe(true);

    const reorderedLegacy = [{ ...legacy[0], no: 9 }];
    const reordered = readLegacyRecommendationItems(reorderedLegacy);
    expect(reordered.items[0].details[0].id).toBe(first.items[0].details[0].id);

    const singular = readLegacyRecommendationItems([{
      nama_barang: "Scanner", service: "x", recommendation_attachment: { file_url: "scan.jpg", source: "legacy" },
    }]);
    expect(singular.items[0].details[0].attachments[0]).toMatchObject({ storage_path: "scan.jpg", source: "legacy" });

    const flatAttachment = readLegacyRecommendationItems([{
      nama_barang: "Router", service: true, storage_path: "router.jpg", file_name: "Router",
    }]);
    expect(flatAttachment.items[0].details[0].attachments[0]).toMatchObject({ storage_path: "router.jpg", caption: "Router" });
  });

  it("creates injected IDs and rejects invalid required values", () => {
    expect(createRecommendationId(() => "detail-fixed")).toBe("detail-fixed");
    expect(() => readLegacyRecommendationItems([{ nama_barang: "Printer", jumlah: 0, service: true }])).toThrow("positive quantity");
    const historical = readLegacyRecommendationItems([{
      nama_barang: "Printer",
      jumlah: 1,
      harga_estimasi: -1,
      service: true,
    }]);
    expect(historical.items[0].details[0]).not.toHaveProperty("estimated_price");
    expect(flattenRecommendationItems(historical)[0]).not.toHaveProperty("estimated_price");
  });
});
