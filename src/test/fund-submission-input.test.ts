import { describe, expect, it } from "vitest";
import {
  getFundSubmissionAmount,
  normalizeFundSubmissionItems,
  toMarisonFundSubmissionItems,
  validateFundSubmissionItems,
} from "@/components/surat/fund-submission";

describe("Fund Submission user input", () => {
  it("normalizes legacy item aliases and keeps a stable row id", () => {
    expect(normalizeFundSubmissionItems([{
      id: "fund-item-1",
      item_name: "Sewa kendaraan",
      quantity: "2",
      unit: "bulan",
      subtotal: "1.500.000",
    }])).toEqual([expect.objectContaining({
      id: "fund-item-1",
      nama_barang: "Sewa kendaraan",
      jumlah: "2",
      satuan: "bulan",
      nominal: "1.500.000",
    })]);
  });

  it("calculates amount from item nominal and strips UI-only ids for Marison", () => {
    const items = [
      { id: "one", nama_barang: "Semen", jumlah: 10, satuan: "sak", nominal: "750.000" },
      { id: "two", nama_barang: "Pasir", jumlah: 1, satuan: "rit", nominal: 1250000 },
    ];
    expect(getFundSubmissionAmount(items)).toBe(2000000);
    expect(toMarisonFundSubmissionItems(items)).toEqual([
      { nama_barang: "Semen", jumlah: 10, satuan: "sak", nominal: 750000 },
      { nama_barang: "Pasir", jumlah: 1, satuan: "rit", nominal: 1250000 },
    ]);
  });

  it("requires complete user input but accepts a zero nominal", () => {
    expect(validateFundSubmissionItems([{
      id: "valid",
      nama_barang: "Biaya administrasi",
      jumlah: 1,
      satuan: "paket",
      nominal: 0,
    }])).toEqual([]);

    expect(validateFundSubmissionItems([{}]).map((issue) => issue.field)).toEqual([
      "nama_barang",
      "jumlah",
      "satuan",
      "nominal",
    ]);
  });
});
