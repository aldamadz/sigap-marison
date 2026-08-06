import { describe, expect, it } from "vitest";
import {
  clearRecommendationInput,
  clearUnitInput,
  getExternalInputFields,
  getInputSchema,
  getScalarFieldValue,
  getWorkflowCategories,
  isMultiSelectField,
  isUnitExternalField,
  normalizeTableRows,
} from "@/components/surat/form/surat-form-schema";
import {
  formatDatePickerDisplay,
  formatFileSize,
  formatIndonesianList,
  getDefaultRequestPlace,
  getDepartmentTitlePart,
  getOfficeTitleSuffix,
  parseDateInputValue,
  toDateInputValue,
} from "@/components/surat/form/surat-form-formatters";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";

describe("SuratForm pure schema adapters", () => {
  it("parses array and serialized input schemas without changing fallback behavior", () => {
    const fields = [{ key: "name", default_source: "manual" }, { key: "office", type: "external_select" }];
    expect(getInputSchema({ id: "usage", master_forms: { input_schema: fields } })).toEqual(fields);
    expect(getInputSchema({ id: "usage", master_forms: { input_schema: JSON.stringify(fields) } })).toEqual(fields);
    expect(getInputSchema({ id: "usage", master_forms: { input_schema: "invalid" } })).toEqual([]);
    expect(getInputSchema({ id: "usage" })).toEqual([]);
  });

  it("classifies manual, external, multi-select, and unit fields exactly", () => {
    const usage = {
      id: "usage",
      master_forms: {
        input_schema: [
          { key: "department", type: "external_select" },
          { key: "generated", default_source: "profile" },
        ],
      },
    } satisfies UsageDetailRecord;
    expect(getExternalInputFields(usage)).toEqual([{ key: "department", type: "external_select" }]);
    expect(isMultiSelectField({ key: "unit" })).toBe(true);
    expect(isUnitExternalField({ key: "requested_unit_count" })).toBe(true);
    expect(isUnitExternalField({ key: "other", externalSourceKey: "marison_units_by_project" })).toBe(true);
  });

  it("normalizes rows, scalar values, categories, and cleared inputs without mutation", () => {
    const input = { requested_project: "P1", requested_unit_count: 2, unit_request_sentence: "x", unit_config_snapshot: {}, keep: "yes" };
    expect(normalizeTableRows([{ name: "A" }, null, "x"])).toEqual([{ name: "A" }]);
    expect(normalizeTableRows(null)).toEqual([{}]);
    expect(normalizeTableRows([null, "x"])).toEqual([]);
    expect(getScalarFieldValue({ value: 7 })).toBe("7");
    expect(getScalarFieldValue(["x"])).toBe("");
    expect(getWorkflowCategories({ id: "usage" })).toEqual(["asset", "non_unit"]);
    expect(getWorkflowCategories({ id: "usage", request_category: "unit" })).toEqual(["unit"]);
    expect(clearUnitInput(input)).toEqual({ keep: "yes" });
    expect(input.requested_project).toBe("P1");
    expect(clearRecommendationInput({ requires_recommendation: true, recommendation_template_name: "x", recommendation_attachment_note: "y", keep: 1 })).toEqual({ keep: 1 });
  });
});

describe("SuratForm pure formatters", () => {
  it("preserves local date input and Indonesian display values", () => {
    const date = new Date(2026, 7, 6);
    expect(toDateInputValue(date)).toBe("2026-08-06");
    expect(parseDateInputValue("2026-08-06")).toEqual(date);
    expect(parseDateInputValue("bad")).toBeUndefined();
    expect(formatDatePickerDisplay("2026-08-06")).toBe("06/08/2026");
  });

  it("preserves list, file-size, department, office, and request-place labels", () => {
    expect(formatIndonesianList(["Printer", " Scanner ", "Laptop"])).toBe("Printer, Scanner, dan Laptop");
    expect(formatFileSize(1025)).toBe("2 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(getDepartmentTitlePart({ id: "d", name: "Pengembangan Organisasi" })).toBe("Dept. Pengembangan Organisasi");
    const pusat = { id: "o", name: "Kantor Pusat", kedudukan: "Pusat" };
    const dept = { id: "d", name: "Pengembangan Organisasi" };
    expect(getOfficeTitleSuffix(pusat, dept)).toBe("Dept. Pengembangan Organisasi Kantor Pusat");
    expect(getDefaultRequestPlace(pusat, dept)).toBe("Magelang");
    expect(getDefaultRequestPlace({ id: "o2", name: "KC Temanggung", kedudukan: "KC" }, null)).toBe("Temanggung");
  });
});
