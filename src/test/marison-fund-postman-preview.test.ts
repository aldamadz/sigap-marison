import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fundPostmanLinks, previewFundForPostman } from "../../backend/src/lib/marison-fund-postman-preview";

const origin = "https://sigap.test";
const link = (token: string) => `${origin}/api/files/view/${token.repeat(32)}/file.pdf`;
const main = link("a"), extra = link("b");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const payload = {
  submission_number: "TEST", type: "marketing_cost", branch_id: 1, division: "Marketing",
  title: "Dana", description: null, amount: 350000,
  items: [{ nama_barang: "Spanduk", jumlah: 1, satuan: "Paket", nominal: 350000 }],
  attachments: [{ name: "Dokumen utama", link: main }, { name: "RAB", link: extra }],
  approvals: [{ role: "manager", nik: "TEST", action: "approved", actioned_at: "2026-10-21T00:00:00Z", notes: null }],
};
const capabilities = ["a", "b"].map((token, index) => ({
  token_hash: hash(token.repeat(32)), surat_id: "letter-a", purpose: "external_marison",
  storage_origin: "external", bucket: "files", object_path: index === 0 ? "main.pdf" : "rab.pdf",
  expires_at: null, revoked_at: null, consumed_at: null,
}));
function options() {
  return { payload: structuredClone(payload) as Record<string, unknown>, suratId: "letter-a", finalPdf: "main.pdf",
    currentAttachments: [{ file_url: "rab.pdf" }], links: fundPostmanLinks(payload, origin),
    capabilities: structuredClone(capabilities), parseRef: (path: string) => ({ origin: "external", bucket: "files", path }), now: 1000 };
}

describe("Fund Postman candidate without writes", () => {
  it("moves only the main PDF, retains marketing_cost and all business fields, and leaves history untouched", () => {
    const input = options(), before = structuredClone(input.payload);
    const result = previewFundForPostman(input);
    expect(result.payload).toEqual({ ...payload, main_document: main, attachments: [payload.attachments[1]] });
    expect(input.payload).toEqual(before);
    expect(result.payloadHash).toBe(hash(JSON.stringify(result.payload)));
    expect(result.changes.join(" ")).toContain("1 lampiran pendukung");
  });
  it("is idempotent for current format and removes duplicate main aliases by storage coordinate", () => {
    const input = options();
    input.payload.main_document = main;
    const first = previewFundForPostman(input);
    const second = previewFundForPostman({ ...input, payload: first.payload, links: fundPostmanLinks(first.payload, origin) });
    expect(second.payload).toEqual(first.payload);
    expect(second.payloadHash).toBe(first.payloadHash);
  });
  it.each(["production_cost", "operational"])("preserves other valid Fund type %s", type => {
    const input = options(); input.payload.type = type;
    expect(previewFundForPostman(input).payload.type).toBe(type);
  });
  it.each([
    { surat_id: "another-letter" }, { revoked_at: "now" }, { consumed_at: "now" },
    { purpose: "download_once" }, { expires_at: "invalid" }, { expires_at: "1970-01-01T00:00:01Z" },
    { object_path: "old-main.pdf" }, { storage_origin: "primary" },
  ])("fails closed for an invalid or stale main capability %j", invalid => {
    const input = options(); Object.assign(input.capabilities[0], invalid);
    expect(() => previewFundForPostman(input)).toThrow(/belum siap/);
  });
  it("blocks missing capabilities, missing/currently changed PDFs and omitted attachments", () => {
    expect(() => previewFundForPostman({ ...options(), capabilities: [] })).toThrow();
    expect(() => previewFundForPostman({ ...options(), finalPdf: null })).toThrow();
    expect(() => previewFundForPostman({ ...options(), currentAttachments: [{ file_url: "new.pdf" }] })).toThrow();
    const input = options(); input.payload.amount = -1;
    expect(() => previewFundForPostman(input)).toThrow();
  });
  it.each(["https://foreign.test/api/files/view/" + "a".repeat(32), "http://sigap.test/main.pdf", "https://sigap.test/main.pdf", main + "?token=secret", main + "#fragment", main.replace("sigap.test", "user:secret@sigap.test")])("never trusts arbitrary attachment URL %s", bad => {
    expect(() => fundPostmanLinks({ ...payload, attachments: [{ name: "Bad", link: bad }] }, origin)).toThrow();
  });
  it("bounds input, validates object fields and preserves additional business data through contract rejection", () => {
    expect(() => fundPostmanLinks({ attachments: Array(129).fill(payload.attachments[0]) }, origin)).toThrow();
    expect(() => fundPostmanLinks({ attachments: [null] }, origin)).toThrow();
    expect(() => fundPostmanLinks({ attachments: [], main_document: {} }, origin)).toThrow();
    const input = options(); input.payload.unknown = "data";
    expect(() => previewFundForPostman(input)).toThrow();
  });
});
