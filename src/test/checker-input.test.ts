import { describe, expect, it } from "vitest";
import {
  canonicalizeCheckerInput,
  normalizeCheckerInputSchema,
  validateCheckerInput,
} from "@/features/surat/inbox/lib/checker-input";

const schema = {
  title: "Pemeriksaan dana",
  fields: [
    { key: "approved_amount", label: "Nominal hasil pemeriksaan", type: "money", required: true, min: 1 },
    { key: "assessment_note", label: "Catatan pemeriksaan", type: "textarea", required: false },
  ],
};

describe("checker input schema", () => {
  it("normalizes supported fields and removes duplicate keys", () => {
    expect(normalizeCheckerInputSchema({
      fields: [
        ...schema.fields,
        { key: "approved amount", label: "Duplikat", type: "invalid" },
      ],
    }).fields).toHaveLength(2);
  });

  it("rejects a missing or non-positive required amount", () => {
    expect(validateCheckerInput(schema, {})).toEqual(["Nominal hasil pemeriksaan wajib diisi."]);
    expect(validateCheckerInput(schema, { approved_amount: "0" })).toEqual(["Nominal hasil pemeriksaan minimal 1."]);
    expect(validateCheckerInput(schema, { approved_amount: "abc12" })).toEqual(["Nominal hasil pemeriksaan harus berupa angka."]);
  });

  it("preserves decimal numeric values and rejects arbitrary punctuation", () => {
    const numeric = { fields: [{ key: "count", label: "Jumlah", type: "number", required: true }] };
    expect(canonicalizeCheckerInput(numeric, { count: "1.5" })).toEqual({ count: 1.5 });
    expect(validateCheckerInput(numeric, { count: "1,5" })).toEqual(["Jumlah harus berupa angka."]);
    expect(validateCheckerInput(schema, { approved_amount: "12.34.56" })).toEqual(["Nominal hasil pemeriksaan harus berupa angka."]);
  });

  it("canonicalizes formatted rupiah and trims text", () => {
    expect(canonicalizeCheckerInput(schema, {
      approved_amount: "Rp 12.500.000",
      assessment_note: "  sesuai RAB  ",
      ignored: "value",
    })).toEqual({
      approved_amount: 12_500_000,
      assessment_note: "sesuai RAB",
    });
  });
});
