import { describe, expect, it } from "vitest";
import { applyExternalUnitReference, getExternalUnitReference } from "@sigap/shared";

describe("external defaults with examiner overrides", () => {
  it("keeps slash-separated external types as the initial value", () => {
    const detail = applyExternalUnitReference({ raw: { type: "30/52" } }, { struktur_atas: "100" });
    expect(detail.unit_type).toBe("30/52");
    expect(detail.struktur_atas).toBe("100");
  });
  it("allows an examiner type even when external type is absent", () => {
    expect(applyExternalUnitReference({ raw: { type: null } }, { unit_type: " 36/72 " }).unit_type).toBe("36/72");
  });
  it("preserves examiner edits over external defaults", () => {
    expect(applyExternalUnitReference({ raw: { type: "36", production_code: "001/UAI/PRC/5.2/07/10/2026" } }, {
      production_serial: "999", production_block: "wrong", production_date: "2020-01-01",
    })).toMatchObject({ unit_type: "36", production_serial: "999", production_block: "wrong", production_date: "2020-01-01" });
  });
  it("retains manual design and rejects object text from external", () => {
    expect(applyExternalUnitReference({ raw: { type: "36" } }, { production_block: "5.2" }).production_block).toBe("5.2");
    expect(getExternalUnitReference({ raw: { type: {}, design: "6.1" } }).type).toBe("");
  });
  it('seeds all production fields initially, keeps deliberate clearing, and survives a JSON draft round-trip', () => {
    const unit = { value: 'B40', raw: { type: '30', production_code: '001/UAI/PRC/5.2/07/10/2026', land_area: 60 } };
    const original = structuredClone(unit);
    expect(applyExternalUnitReference(unit, {})).toMatchObject({ unit_type: '30', production_serial: '001', production_block: '5.2', production_date: '2026-10-07' });
    const edit = { unit_type: '36/72', production_serial: '009', production_block: '6.1', production_date: '2026-11-09' };
    const saved = JSON.parse(JSON.stringify(applyExternalUnitReference(unit, edit)));
    expect(applyExternalUnitReference({ ...unit, raw: { ...unit.raw, type: '45' } }, saved)).toMatchObject(edit);
    expect(applyExternalUnitReference(unit, { unit_type: '', production_serial: '', production_block: '', production_date: '' }))
      .toMatchObject({ unit_type: '', production_serial: '', production_block: '', production_date: '' });
    expect(unit).toEqual(original);
  });
});
