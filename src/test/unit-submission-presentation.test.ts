import { describe, expect, it } from "vitest";
import { verifiedUnitTitle, verifiedUnitDescription } from "../../backend/src/lib/unit-submission-presentation";

describe("verified Unit presentation", () => {
  const title = "Pengajuan SPK Unit: 30 Unit Marison Sragen Dept. Marketing Kantor Pusat";
  it("changes only the first quantity phrase and keeps project/type/date numbers", () => {
    expect(verifiedUnitTitle(title, 3)).toBe(title.replace("30 Unit", "3 Unit"));
    expect(verifiedUnitTitle("SPK 30 Unit tipe 30/60 tahun 2026", 3)).toBe("SPK 3 Unit tipe 30/60 tahun 2026");
    expect(verifiedUnitTitle(verifiedUnitTitle(title, 3), 2)).toContain("2 Unit Marison Sragen");
  });
  it("handles custom and empty titles without losing their text", () => {
    expect(verifiedUnitTitle("Rumah siap bangun Sragen", 3)).toBe("Rumah siap bangun Sragen (3 Unit)");
    expect(verifiedUnitTitle("", 3)).toBe("Pengajuan SPK Unit: 3 Unit");
  });
  it.each([0, -1, 2.5, NaN, Infinity])("rejects invalid verified counts %s", count => {
    expect(() => verifiedUnitTitle(title, count)).toThrow();
  });
  it("leads with ready units and preserves labelled request and examiner evidence", () => {
    const text = verifiedUnitDescription(title, 3, 30, "Mohon pembangunan bertahap.", { actor_name: "Pemeriksa Uji", note: "Baru 3 kavling yang siap bangun." });
    expect(text.startsWith(title.replace("30 Unit", "3 Unit"))).toBe(true);
    expect(text).toContain("Diajukan: 30 unit; siap bangun: 3 unit; belum dipenuhi: 27 unit.");
    expect(text).toContain("Catatan pemohon:\nMohon pembangunan bertahap.");
    expect(text).toContain("Catatan pemeriksa (Pemeriksa Uji):\nBaru 3 kavling yang siap bangun.");
  });
  it("does not invent missing notes or pending quantities", () => {
    expect(verifiedUnitDescription(title, 30, 30, "", null)).toContain("belum dipenuhi: 0 unit");
    expect(verifiedUnitDescription(title, 3, undefined, null, null)).toBe(verifiedUnitTitle(title, 3));
  });
});
