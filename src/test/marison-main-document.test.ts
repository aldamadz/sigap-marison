import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildMarisonDocumentBundle } from "../../backend/src/lib/marison-document-links";
import { assertMarisonOutboundContract } from "../../server/marison-outbound-contract.mjs";
import { mapMarisonFundSubmission } from "../../server/marison-fund-submission.mjs";
import { mapMarisonAssetRequest } from "../../server/marison-asset-items.mjs";
import { buildSafeContext, comparePayloads, diagnoseVendorRejection, sanitizePayloadForComparison } from "../../server/marison-rejection-diagnosis.mjs";

const main = "https://sigap.example.test/api/files/view/test-main/form.pdf";
const attachment = "https://sigap.example.test/api/files/view/test-attachment/rab.pdf";
const parseRef = (path: string) => {
  if (!path.startsWith("primary:") && !path.startsWith("secondary:")) return null;
  const [origin, name] = path.split(":");
  return { origin, bucket: "dokumen_surat", path: name };
};
const fixture = (name: string) => JSON.parse(readFileSync(`docs/contracts/marison/v1/${name}`, "utf8"));

describe("Digivasi main_document contract (15 October 2026)", () => {
  it("reports main-document presence without disclosing its bearer URL", () => {
    const payload = { main_document: main };
    expect(buildSafeContext(payload, "asset", new Set())).toEqual({ hasMainDocument: true });
    expect(JSON.stringify(sanitizePayloadForComparison(payload))).not.toContain(main);
    expect(JSON.stringify(diagnoseVendorRejection({ detail: [{ loc: ["main_document"], msg: `Tidak dapat membaca ${main}` }] })))
      .not.toContain(main);
    expect(comparePayloads({}, payload, "asset")).toContain("Dokumen utama ditambahkan.");
    expect(comparePayloads(payload, { main_document: `${main}?different-link` }, "asset")).toEqual([]);
  });

  it("wires all four runtime builders to the canonical main document bundle", () => {
    const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
    const builders = ["Unit", "NonUnit", "Asset", "Fund", "Dispatch"];
    for (let i = 0; i < builders.length - 1; i++) {
      const body = source.slice(source.indexOf(`const buildMarison${builders[i]}Payload`), source.indexOf(`const buildMarison${builders[i + 1]}Payload`));
      expect(body).toContain("await buildMarisonDocumentLinks(surat, actorId)");
      expect(body).toContain(builders[i] === "Fund" ? "mainDocument: documents.mainDocument" : "main_document: documents.mainDocument");
      expect(body).toContain("documents.attachments");
      expect(body).not.toContain("attachments[0]");
    }
  });
  it.each([
    ["unit", "unit-submission.example.json"], ["non_unit", "non-unit-submission.example.json"],
    ["asset", "asset-purchase-request.example.json"], ["fund", "fund-submission.example.json"],
  ])("accepts a separate PDF URL for %s and retains optional historical compatibility", (kind, file) => {
    const old = fixture(file);
    const snapshot = structuredClone(old);
    const payload = { ...old, main_document: main };
    expect(assertMarisonOutboundContract(kind, payload)).toEqual(payload);
    expect(assertMarisonOutboundContract(kind, old)).toEqual(snapshot);
    for (const invalid of [{ name: "PDF", link: main }, "native://document/source", "javascript:alert(1)", "file:///private.pdf", "", null]) {
      expect(() => assertMarisonOutboundContract(kind, { ...old, main_document: invalid })).toThrow();
    }
    expect(old).toEqual(snapshot);
  });

  it("sends the main PDF separately and keeps requester/checker attachments once", async () => {
    const mintLink = vi.fn(async (path: string) => path === "primary:final.pdf" ? main : attachment);
    const result = await buildMarisonDocumentBundle({
      finalPdfPath: "primary:final.pdf", parseRef, mintLink,
      attachments: [
        { file_url: "primary:final.pdf", file_name: "Duplicate main" },
        { file_url: "primary:rab.pdf", requirement_label: "RAB Pemeriksa" },
        { file_url: "primary:rab.pdf", file_name: "Duplicate RAB" },
      ],
    });
    expect(result).toEqual({ mainDocument: main, attachments: [{ name: "RAB Pemeriksa", link: attachment }] });
    expect(mintLink.mock.calls.map(([path]) => path)).toEqual(["primary:final.pdf", "primary:rab.pdf"]);
  });

  it("does not conflate identical paths in different storage origins", async () => {
    const mintLink = vi.fn(async (path: string) => path.startsWith("primary:") ? main : attachment);
    const result = await buildMarisonDocumentBundle({ finalPdfPath: "primary:final.pdf", parseRef, mintLink,
      attachments: [{ file_url: "secondary:final.pdf", file_name: "Bukti" }] });
    expect(result.attachments).toEqual([{ name: "Bukti", link: attachment }]);
  });

  it.each([null, "native://document/not-ready", "unknown:source.xlsx"])("never promotes an attachment when final PDF is %s", async (finalPdfPath) => {
    const mintLink = vi.fn(async () => attachment);
    await expect(buildMarisonDocumentBundle({ finalPdfPath, parseRef, mintLink,
      attachments: [{ file_url: "primary:rab.pdf" }] })).rejects.toMatchObject({ status: 422, code: "main_document_unavailable" });
    expect(mintLink).not.toHaveBeenCalled();
  });

  it.each([null, "native://document/source", "file:///private.pdf"])("fails closed when main link minting returns %s", async (value) => {
    await expect(buildMarisonDocumentBundle({ finalPdfPath: "primary:final.pdf", parseRef,
      mintLink: async () => value, attachments: [] })).rejects.toMatchObject({ status: 422 });
  });

  it("does not silently discard a supplementary attachment whose link failed", async () => {
    await expect(buildMarisonDocumentBundle({ finalPdfPath: "primary:final.pdf", parseRef,
      mintLink: async (path) => path === "primary:final.pdf" ? main : null,
      attachments: [{ file_url: "primary:rab.pdf" }] })).rejects.toMatchObject({ status: 422 });
  });

  it.each(["operational", "production_cost", "marketing_cost"])("maps %s Dana, including KEU callers, without changing its amount or type", (type) => {
    const source = fixture("fund-submission.example.json");
    const result = mapMarisonFundSubmission({ request: {
      submissionNumber: source.submission_number, type, title: source.title, amount: source.amount, items: source.items,
    }, branchId: source.branch_id, division: source.division, mainDocument: main,
      attachments: [{ name: "RAB", link: attachment }], approvals: source.approvals });
    expect(result.payload).toMatchObject({ main_document: main, type, amount: source.amount, attachments: [{ name: "RAB", link: attachment }] });
  });

  it.each([false, true])("keeps main PDF separate from asset item/recommendation attachments (recommendation=%s)", (recommendationRequired) => {
    const payload = mapMarisonAssetRequest({ request: { main_document: main },
      applicantItems: [{ id: "item", nama_barang: "Komputer", jumlah: 1 }],
      recommendationRequired,
      recommendationRows: [{ parent_item_id: "item", asset_name: "Komputer direkomendasikan", quantity: 1 }],
      recommendationPdf: { name: "Rekomendasi", link: "https://sigap.example.test/recommendation.pdf" },
      applicantAttachments: [{ name: "Lampiran", link: attachment }],
    });
    expect(payload.main_document).toBe(main);
    expect(payload.items[0].attachments).toContainEqual({ name: "Lampiran", link: attachment });
    expect(payload.items[0].attachments).not.toContainEqual(expect.objectContaining({ link: main }));
    expect(Object.isFrozen(payload)).toBe(true);
  });
});
