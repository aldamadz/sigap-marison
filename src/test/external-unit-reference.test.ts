import { describe, expect, it } from "vitest";
import { applyExternalUnitReference, getExternalUnitReference } from "@sigap/shared";

describe("authoritative external unit reference", () => {
  it("keeps slash-separated types verbatim and ignores manual type", () => {
    const detail = applyExternalUnitReference({ raw: { type: "30/52" } }, { unit_type: "3052", struktur_atas: "100" });
    expect(detail.unit_type).toBe("30/52");
    expect(detail.struktur_atas).toBe("100");
  });
  it("does not resurrect a manual type if the external type is absent", () => {
    expect(applyExternalUnitReference({ raw: { type: null } }, { unit_type: "3052" }).unit_type).toBe("");
  });
  it("uses external design, serial and production date over imported fields", () => {
    expect(applyExternalUnitReference({ raw: { type: "36", production_code: "001/UAI/PRC/5.2/07/10/2026" } }, {
      production_serial: "999", production_block: "wrong", production_date: "2020-01-01",
    })).toMatchObject({ unit_type: "36", production_serial: "001", production_block: "5.2", production_date: "2026-10-07" });
  });
  it("leaves manually entered design available only when external does not supply it", () => {
    expect(applyExternalUnitReference({ raw: { type: "36" } }, { production_block: "5.2" }).production_block).toBe("5.2");
    expect(getExternalUnitReference({ raw: { type: {}, design: "6.1" } }).type).toBe("");
  });
});
