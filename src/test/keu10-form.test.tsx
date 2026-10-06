import { describe, expect, it } from "vitest";
import { isKeu10Form, normalizeKeu10SubmissionItems, getKeu10SubmissionAmount, validateKeu10SubmissionItems } from "@/features/surat/registration/lib/keu10-form";
import { normalizeKeu10Config, type Keu10Config } from "@/features/surat/registration/lib/keu10-config";

const item = { keterangan: "Pengurusan tanah", jumlah: 3, satuan: "dokumen", estimasi_harga_satuan: "Rp 150.000", total: 1, status: "PGD", nominal: 1 };
const config: Keu10Config = { version: 1, disposition: "legal_land", purposes: [{ code: "land", label: "Pengurusan tanah" }], approval_threshold: null };

describe("KEU 10 identity and client arithmetic", () => {
  it.each(["FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"])("accepts %s", (nomor_form) => {
    expect(isKeu10Form({ nomor_form })).toBe(true);
  });
  it.each(["FM-UAI.KEU-01-00", "FM-MBN.KEU-01-00", "FM-UAI.KEU-10-01", "FM-X.KEU-10-00", "KEU-10", "FM-UAI.KEU-100-00", ""])("rejects %s", (nomor_form) => {
    expect(isKeu10Form({ nomor_form })).toBe(false);
  });
  it("does not infer form identity from names or absent metadata", () => {
    expect(isKeu10Form(null)).toBe(false);
    expect(isKeu10Form(undefined)).toBe(false);
    expect(isKeu10Form({})).toBe(false);
  });
  it("recomputes total and strips PGD fields instead of trusting stored totals", () => {
    const normalized = normalizeKeu10SubmissionItems([item]);
    expect(normalized[0]).toMatchObject({ total: 450_000 });
    expect(normalized[0]).not.toHaveProperty("status");
    expect(normalized[0]).not.toHaveProperty("nominal");
    expect(getKeu10SubmissionAmount([item, { ...item, jumlah: 2, total: 99_000_000 }])).toBe(750_000);
    expect(validateKeu10SubmissionItems([item])).toEqual([]);
    expect(item.total).toBe(1);
  });
  it.each([0, -1, 1.5, "", "NaN", Infinity, true])("rejects invalid quantity %s", (jumlah) => {
    expect(validateKeu10SubmissionItems([{ ...item, jumlah }])).toEqual(expect.arrayContaining([expect.objectContaining({ field: "jumlah" })]));
  });
  it.each(["", -1, Infinity, "1e5", "1.50"])("rejects invalid price %s", (estimasi_harga_satuan) => {
    expect(validateKeu10SubmissionItems([{ ...item, estimasi_harga_satuan }]).length).toBeGreaterThan(0);
  });
  it("rejects unsafe products and grand totals, but permits zero unit price", () => {
    const large = { ...item, jumlah: 2, estimasi_harga_satuan: Number.MAX_SAFE_INTEGER };
    expect(getKeu10SubmissionAmount([large])).toBeNull();
    expect(validateKeu10SubmissionItems([large]).length).toBeGreaterThan(0);
    const safeRow = { ...large, jumlah: 1 };
    expect(getKeu10SubmissionAmount([safeRow, safeRow])).toBeNull();
    expect(validateKeu10SubmissionItems([safeRow, safeRow]).length).toBeGreaterThan(0);
    expect(validateKeu10SubmissionItems([{ ...item, estimasi_harga_satuan: 0 }])).toEqual([]);
  });
  it("requires items and bounded description/unit text", () => {
    expect(validateKeu10SubmissionItems([null, [], "invalid"]).length).toBeGreaterThan(0);
    expect(validateKeu10SubmissionItems([{ ...item, keterangan: " ", satuan: "" }]).map((issue) => issue.field)).toEqual(["keterangan", "satuan"]);
    expect(validateKeu10SubmissionItems([{ ...item, keterangan: "x".repeat(241), satuan: "x".repeat(81) }]).length).toBe(2);
  });
});

describe("KEU 10 usage config parser", () => {
  it.each(["legal_land", "tactical_land", "village_equipment"] as const)("accepts %s", (disposition) => {
    const approval_threshold = disposition === "tactical_land" ? 2_000_000 : null;
    expect(normalizeKeu10Config({ ...config, disposition, approval_threshold })).toEqual({ ...config, disposition, approval_threshold });
  });
  it("copies only the public contract and trims purpose values", () => {
    expect(normalizeKeu10Config({ ...config, purposes: [{ code: " land ", label: " Pengurusan tanah " }], secret: "not included" })).toEqual(config);
  });
  it.each([
    null, [], "{}", {}, { ...config, version: 2 }, { ...config, disposition: "unknown" },
    { ...config, purposes: [] }, { ...config, purposes: [null] },
    { ...config, purposes: [{ code: "land", label: "" }] },
    { ...config, purposes: [{ code: "land", label: "one" }, { code: " land ", label: "two" }] },
    { ...config, approval_threshold: "2000000" }, { ...config, approval_threshold: -1 },
    { ...config, approval_threshold: Infinity }, { ...config, approval_threshold: 1.5 },
    { ...config, disposition: "tactical_land", approval_threshold: null },
    { ...config, disposition: "tactical_land", approval_threshold: 1_999_999 },
    { ...config, approval_threshold: 2_000_000 },
    { ...config, disposition: "village_equipment", approval_threshold: 2_000_000 },
    { ...config, purposes: [{ code: "Invalid-Code", label: "Label" }] },
    { ...config, purposes: [{ code: "1invalid", label: "Label" }] },
    { ...config, purposes: [{ code: "x".repeat(65), label: "Label" }] },
    { ...config, purposes: [{ code: "land", label: "x".repeat(241) }] },
    { ...config, purposes: Array.from({ length: 51 }, (_, index) => ({ code: `purpose_${index}`, label: "Label" })) },
  ])("fails closed for malformed config %#", (value) => {
    expect(normalizeKeu10Config(value)).toBeNull();
  });
});
