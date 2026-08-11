import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mapMarisonAssetItems, mapMarisonAssetRequest, MarisonAssetItemsError } from "./marison-asset-items.mjs";

const pdf = { name: "Dokumen Rekomendasi Aset", link: "https://sigap.test/recommendation.pdf" };
const parents = [
  { id: "item-a", nama_barang: "Komputer", jumlah: 1 },
  { id: "item-b", nama_barang: "Printer", jumlah: 2 },
];

test("maps canonical v1 fixture accepted by shared and PDF layers", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/recommendation-multi-detail-v1.json", import.meta.url), "utf8"));
  const items = mapMarisonAssetItems({ applicantItems: parents, recommendationRows: fixture, recommendationPdf: pdf });
  assert.equal(items[0].asset_name, "Motherboard ATX");
});

test("expands one applicant item into many recommended details", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{
      parent_item_id: "item-a",
      details: [
        { detail_name: "RAM 32 GB", quantity: 2, estimated_price: "Rp 1.500.000", description: "Upgrade memori" },
        { specification: "SSD NVMe 1 TB", quantity: 1, description: "Penyimpanan utama" },
      ],
    }],
    recommendationPdf: pdf,
  });

  assert.deepEqual(items.map(({ asset_name }) => asset_name), ["RAM 32 GB", "SSD NVMe 1 TB"]);
  assert.equal("estimated_price" in items[0], false);
  assert.ok(Object.isFrozen(items) && Object.isFrozen(items[0]) && Object.isFrozen(items[0].attachments));
});

test("maps many parents to many details by stable parent_item_id", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [
      { parent_item_id: "item-b", details: [{ detail_name: "Printhead", quantity: 1 }] },
      { parent_item_id: "item-a", details: [{ detail_name: "Power supply", quantity: 1 }] },
    ],
    recommendationPdf: pdf,
  });
  assert.deepEqual(items.map(({ asset_name }) => asset_name), ["Printhead", "Power supply"]);
});

test("maps canonical parent items and detail fields", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: { version: 1, items: [{
      id: "item-a",
      status: "recommended",
      applicant_original: { name: "Komputer", quantity: 1, notes: "Original" },
      details: [{
        id: "detail-a",
        status: "recommended",
        action: "replace",
        name: "Motherboard ATX",
        quantity: 1,
        description: "Pengganti motherboard rusak",
        estimated_price: 2_500_000,
      }],
    }] },
    recommendationPdf: pdf,
  });
  assert.deepEqual(items[0], {
    asset_name: "Motherboard ATX",
    quantity: 1,
    description: "Pengganti motherboard rusak",
    attachments: [pdf],
  });
});

test("canonical rejected parent emits no details even when children are recommended", () => {
  assert.throws(() => mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: { version: 1, items: [{
      id: "item-a",
      status: "not_recommended",
      details: [{ status: "recommended", name: "RAM 32 GB", quantity: 1 }],
    }] },
    recommendationPdf: pdf,
  }), MarisonAssetItemsError);
});

test("legacy nested and flat rejection aliases emit no outbound items", () => {
  for (const recommendationRows of [
    [{ parent_item_id: "item-a", details: [{ name: "RAM", quantity: 1, status: "ditolak" }] }],
    [{ parent_item_id: "item-a", name: "RAM", quantity: 1, recommendation_action: "tidak direkomendasikan" }],
  ]) {
    assert.throws(() => mapMarisonAssetItems({ applicantItems: parents, recommendationRows, recommendationPdf: pdf }), MarisonAssetItemsError);
  }
});

test("legacy false rejection marker remains recommended", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", name: "RAM", quantity: 1, action: "service", tidak_direkomendasikan: "false" }],
    recommendationPdf: pdf,
  });
  assert.equal(items.length, 1);
});

test("canonical mixed parents emit every valid detail only from recommended parents", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: { version: 1, items: [
      {
        id: "item-a",
        status: "not_recommended",
        details: [{ status: "recommended", name: "Stale RAM", quantity: 1 }],
      },
      {
        id: "item-b",
        status: "recommended",
        details: [
          { status: "recommended", name: "Laser toner", quantity: 2 },
          { status: "not_recommended", name: "Rejected drum", quantity: 1 },
        ],
      },
    ] },
    recommendationPdf: pdf,
  });
  assert.deepEqual(items.map(({ asset_name }) => asset_name), ["Laser toner", "Rejected drum"]);
});

test("omits not recommended details and fails typed when all are rejected or invalid", () => {
  assert.throws(() => mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [
      { parent_item_id: "item-a", detail_name: "RAM", quantity: 1, recommendation_action: "not_recommended" },
      { parent_item_id: "item-b", detail_name: "Printer", quantity: 0 },
    ],
    recommendationPdf: pdf,
  }), (error) => error instanceof MarisonAssetItemsError && error.code === "MARISON_ASSET_ITEMS_EMPTY" && error.status === 422);
});

test("uses only same combined recommendation PDF link for every outgoing item", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", details: [
      { detail_name: "RAM", quantity: 1, attachments: [{ link: "https://source.test/ram.jpg" }] },
      { detail_name: "SSD", quantity: 1, recommendation_attachment_url: "https://source.test/ssd.jpg" },
    ] }],
    recommendationPdf: pdf,
  });
  assert.deepEqual(items.map(({ attachments }) => attachments), [[pdf], [pdf]]);
  assert.strictEqual(items[0].attachments[0], items[1].attachments[0]);
});

test("keeps bearer-free logical attachment reference in immutable payload", () => {
  const reference = { type: "sigap_recommendation_pdf", surat_id: "child-1", name: "Dokumen Rekomendasi Aset" };
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", detail_name: "RAM", quantity: 1 }],
    recommendationPdf: reference,
  });
  assert.deepEqual(items[0].attachments, [reference]);
  assert.equal(JSON.stringify(items).includes("/api/files/view/"), false);
});

test("outbound mapper omits internal estimated_price", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", detail_name: "RAM", quantity: 1, estimated_price: 2_500_000 }],
    recommendationPdf: pdf,
  });
  assert.equal("estimated_price" in items[0], false);
});

test("rejects logical attachment reference without recommendation ID", () => {
  assert.throws(() => mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", detail_name: "RAM", quantity: 1 }],
    recommendationPdf: { type: "sigap_recommendation_pdf", surat_id: "", name: "Dokumen Rekomendasi Aset" },
  }), MarisonAssetItemsError);
});

test("supports unambiguous legacy index and name matching", () => {
  const items = mapMarisonAssetItems({
    applicantItems: parents,
    recommendationRows: [
      { parent_item_index: 1, nama_barang: "Legacy RAM", jumlah: "2", uraian: "DDR5" },
      { parent_item_name: "Printer", nama_barang: "Legacy toner", jumlah: 1, keterangan: "Black" },
    ],
    recommendationPdf: pdf,
  });
  assert.deepEqual(items.map(({ asset_name, quantity, description }) => ({ asset_name, quantity, description })), [
    { asset_name: "Legacy RAM", quantity: 2, description: undefined },
    { asset_name: "Legacy toner", quantity: 1, description: "Black" },
  ]);
});

test("rejects ambiguous legacy name matching", () => {
  assert.throws(() => mapMarisonAssetItems({
    applicantItems: [{ nama_barang: "Laptop" }, { nama_barang: "Laptop" }],
    recommendationRows: [{ parent_item_name: "Laptop", detail_name: "RAM", quantity: 1 }],
    recommendationPdf: pdf,
  }), MarisonAssetItemsError);
});

test("preserves request_number and approvals while replacing only items", () => {
  const approvals = [{ role: "Director", nik: "EMP-1", action: "approved", actioned_at: "2026-08-10T07:00:00.000Z" }];
  const payload = mapMarisonAssetRequest({
    request: { request_number: "REQ-001", branch_id: 7, approvals, items: [{ asset_name: "source item" }] },
    applicantItems: parents,
    recommendationRows: [{ parent_item_id: "item-a", detail_name: "RAM", quantity: 1 }],
    recommendationPdf: pdf,
  });
  assert.equal(payload.request_number, "REQ-001");
  assert.deepEqual(payload.approvals, approvals);
  assert.notStrictEqual(payload.approvals, approvals);
  assert.deepEqual(payload.items.map(({ asset_name }) => asset_name), ["RAM"]);
  assert.ok(Object.isFrozen(payload) && Object.isFrozen(payload.approvals));
  assert.equal(Object.isFrozen(approvals), false);
  assert.throws(() => { payload.items[0].asset_name = "mutated"; }, TypeError);
  assert.throws(() => { payload.approvals.push({}); }, TypeError);
});

test("mapper performs no network access", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network attempted"); };
  try {
    assert.deepEqual(mapMarisonAssetItems({
      applicantItems: parents,
      recommendationRows: [{ parent_item_id: "item-a", detail_name: "RAM", quantity: 1 }],
      recommendationPdf: pdf,
    }).map(({ asset_name }) => asset_name), ["RAM"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
