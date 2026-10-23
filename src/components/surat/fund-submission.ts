import { parseCurrencyInput } from "@/lib/rupiah";
import { isPgdItemStatus } from "@/components/surat/pgd-item-status";
import { parseItemQuantity } from "@sigap/shared";

export type FundSubmissionItem = {
  id?: string;
  nama_barang?: string;
  jumlah?: number | string;
  satuan?: string;
  nominal?: number | string;
  estimasi_harga_satuan?: number | string;
  total?: number | string;
  status?: string;
};

export type FundSubmissionValidationIssue = {
  index: number;
  field: "nama_barang" | "jumlah" | "satuan" | "nominal" | "status";
  message: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const editableText = (value: unknown) => String(value ?? "");
const scalar = (value: unknown): string | number => (
  typeof value === "string" || typeof value === "number" ? value : ""
);

const stableId = () => globalThis.crypto?.randomUUID?.()
  || `fund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createFundSubmissionItem = (): FundSubmissionItem => ({ id: stableId() });

export function normalizeFundSubmissionItems(value: unknown): FundSubmissionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      ...row,
      id: text(row.id) || undefined,
      // This normalizer feeds controlled inputs on every keystroke. Trimming
      // here would remove a just-entered trailing space before the next word.
      nama_barang: editableText(row.nama_barang ?? row.item_name ?? row.nama ?? row.name),
      jumlah: scalar(row.jumlah ?? row.quantity),
      satuan: editableText(row.satuan ?? row.sat ?? row.unit),
      nominal: scalar(row.nominal ?? row.subtotal ?? row.nilai),
      estimasi_harga_satuan: scalar(row.estimasi_harga_satuan ?? row.harga_satuan ?? row.unit_price),
      total: scalar(row.total),
      status: editableText(row.status),
    }));
}

export function parseFundSubmissionQuantity(value: unknown): number | null {
  return parseItemQuantity(value);
}

export function parseFundSubmissionNominal(value: unknown): number | null {
  return parseCurrencyInput(value);
}

export function getFundSubmissionAmount(value: unknown): number {
  return normalizeFundSubmissionItems(value).reduce((total, item) => (
    total + (parseFundSubmissionNominal(item.nominal) ?? 0)
  ), 0);
}

export function validateFundSubmissionItems(value: unknown): FundSubmissionValidationIssue[] {
  const rows = normalizeFundSubmissionItems(value);
  if (rows.length === 0) {
    return [{ index: 0, field: "nama_barang", message: "Tambahkan minimal satu rincian dana." }];
  }

  return rows.flatMap((row, index) => {
    const issues: FundSubmissionValidationIssue[] = [];
    if (!text(row.nama_barang)) issues.push({ index, field: "nama_barang", message: `Nama item ${index + 1} wajib diisi.` });
    if (parseFundSubmissionQuantity(row.jumlah) === null) issues.push({ index, field: "jumlah", message: `Jumlah item ${index + 1} harus lebih dari 0, maksimal 6 angka desimal.` });
    if (!text(row.satuan)) issues.push({ index, field: "satuan", message: `Satuan item ${index + 1} wajib diisi.` });
    if (parseFundSubmissionNominal(row.nominal) === null) issues.push({ index, field: "nominal", message: `Nominal item ${index + 1} wajib berupa Rupiah non-negatif.` });
    if (!isPgdItemStatus(row.status)) issues.push({ index, field: "status", message: `Pilih status 1–4 untuk item ${index + 1}.` });
    return issues;
  });
}

export function toMarisonFundSubmissionItems(value: unknown) {
  return normalizeFundSubmissionItems(value).map((row) => ({
    nama_barang: text(row.nama_barang),
    jumlah: parseFundSubmissionQuantity(row.jumlah) ?? 0,
    satuan: text(row.satuan),
    nominal: parseFundSubmissionNominal(row.nominal) ?? 0,
  }));
}
