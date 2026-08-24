import { describe, it, expect } from "vitest";
import {
  parseCurrencyInput,
  parseRupiahInteger,
  formatCurrencyInput,
  formatRupiah,
  formatRupiahZero,
} from "@/lib/rupiah";

describe("parseCurrencyInput", () => {
  it.each([
    [1000000, 1000000],
    ["1000000", 1000000],
    ["1.000.000", 1000000],
    ["1,000,000", 1000000],
    ["Rp 1.000.000", 1000000],
    ["Rp. 1.000.000", 1000000],
    ["Rp.1.000.000", 1000000],
    ["rp 1000000", 1000000],
    [0, 0],
    ["0", 0],
    [500000, 500000],
  ])("parses %s → %i", (input, expected) => {
    expect(parseCurrencyInput(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    [-1],
    ["-1000"],
    [1.5],
    ["1.5"],
    [NaN],
    [Infinity],
    ["abc"],
    ["Rp abc"],
  ])("returns null for invalid input %s", (input) => {
    expect(parseCurrencyInput(input as any)).toBeNull();
  });

  it("returns null for value exceeding MAX_SAFE_INTEGER", () => {
    expect(parseCurrencyInput(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });
});

describe("parseRupiahInteger", () => {
  it("returns 0 for null", () => expect(parseRupiahInteger(null)).toBe(0));
  it("returns 0 for empty string", () => expect(parseRupiahInteger("")).toBe(0));
  it("returns 1000000 for Rp 1.000.000", () => expect(parseRupiahInteger("Rp 1.000.000")).toBe(1000000));
});

describe("formatCurrencyInput", () => {
  it("formats 1000000 → '1.000.000'", () => expect(formatCurrencyInput(1000000)).toBe("1.000.000"));
  it("formats 0 → '0'", () => expect(formatCurrencyInput(0)).toBe("0"));
  it("formats null → ''", () => expect(formatCurrencyInput(null)).toBe(""));
  it("formats undefined → ''", () => expect(formatCurrencyInput(undefined)).toBe(""));
  it("formats '' → ''", () => expect(formatCurrencyInput("")).toBe(""));
  it("round-trip: parse(format(1000000)) === 1000000", () => {
    expect(parseCurrencyInput(formatCurrencyInput(1000000))).toBe(1000000);
  });
  it("round-trip: parse(format(500000)) === 500000", () => {
    expect(parseCurrencyInput(formatCurrencyInput(500000))).toBe(500000);
  });
});

describe("formatRupiah", () => {
  it("formats 1000000 → 'Rp 1.000.000'", () => expect(formatRupiah(1000000)).toBe("Rp 1.000.000"));
  it("formats 0 → 'Rp 0'", () => expect(formatRupiah(0)).toBe("Rp 0"));
  it("formats null → '-'", () => expect(formatRupiah(null)).toBe("-"));
  it("formats undefined → '-'", () => expect(formatRupiah(undefined)).toBe("-"));
  it("formats '' → '-'", () => expect(formatRupiah("")).toBe("-"));
  it("formats 'Rp 1.000.000' → 'Rp 1.000.000'", () => expect(formatRupiah("Rp 1.000.000")).toBe("Rp 1.000.000"));
});

describe("formatRupiahZero", () => {
  it("formats 0 → 'Rp 0'", () => expect(formatRupiahZero(0)).toBe("Rp 0"));
  it("formats null → '-'", () => expect(formatRupiahZero(null)).toBe("-"));
  it("formats '' → '-'", () => expect(formatRupiahZero("")).toBe("-"));
  it("formats 1000000 → 'Rp 1.000.000'", () => expect(formatRupiahZero(1000000)).toBe("Rp 1.000.000"));
});

describe("canonical consistency", () => {
  const oneMillion = 1000000;
  it("UI input and Rupiah display use same parse result", () => {
    expect(parseCurrencyInput(formatCurrencyInput(oneMillion))).toBe(oneMillion);
    expect(parseCurrencyInput(formatRupiah(oneMillion).replace(/^Rp\s/, ""))).toBe(oneMillion);
  });
  it("empty nominal stays empty — not coerced to zero", () => {
    expect(parseCurrencyInput("")).toBeNull();
    expect(parseCurrencyInput(null)).toBeNull();
    expect(formatCurrencyInput(null)).toBe("");
    expect(formatRupiah(null)).toBe("-");
  });
  it("zero nominal is valid and distinct from empty", () => {
    expect(parseCurrencyInput(0)).toBe(0);
    expect(formatRupiah(0)).toBe("Rp 0");
    expect(formatCurrencyInput(0)).toBe("0");
  });
});
