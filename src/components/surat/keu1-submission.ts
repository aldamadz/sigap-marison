import { parseCurrencyInput } from "@/lib/rupiah";

export type Keu1SubmissionItem = {
  id?: string;
  keterangan?: string;
  jumlah?: number | string;
  satuan?: string;
  estimasi_harga_satuan?: number | string;
  total?: number | string;
};

export type Keu1SubmissionValidationIssue = {
  index: number;
  field: "keterangan" | "jumlah" | "satuan" | "estimasi_harga_satuan";
  message: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const editableText = (value: unknown) => String(value ?? "");
const scalar = (value: unknown): string | number => (
  typeof value === "string" || typeof value === "number" ? value : ""
);

const stableId = () => globalThis.crypto?.randomUUID?.()
  || `keu1-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createKeu1SubmissionItem = (): Keu1SubmissionItem => ({ id: stableId() });

export function normalizeKeu1SubmissionItems(value: unknown): Keu1SubmissionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      ...row,
      id: text(row.id) || undefined,
      keterangan: editableText(row.keterangan ?? row.nama_barang ?? row.name ?? row.description),
      jumlah: scalar(row.jumlah ?? row.quantity),
      satuan: editableText(row.satuan ?? row.sat ?? row.unit),
      estimasi_harga_satuan: scalar(row.estimasi_harga_satuan ?? row.harga_satuan ?? row.unit_price),
      total: scalar(row.total),
    }));
}

export function parseKeu1Quantity(value: unknown): number | null {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

export function parseKeu1Money(value: unknown): number | null {
  return parseCurrencyInput(value);
}

function computeItemTotal(row: Keu1SubmissionItem): number {
  const quantity = parseKeu1Quantity(row.jumlah) ?? 0;
  const unitPrice = parseKeu1Money(row.estimasi_harga_satuan) ?? 0;
  return quantity * unitPrice;
}

export function getKeu1SubmissionAmount(value: unknown): number {
  return normalizeKeu1SubmissionItems(value)
    .reduce((total, item) => total + computeItemTotal(item), 0);
}

export function getKeu1FinancialSummary(items: unknown, freeCashValue: unknown) {
  const grandTotal = getKeu1SubmissionAmount(items);
  const hasFreeCash = freeCashValue != null && String(freeCashValue).trim() !== "";
  const freeCash = hasFreeCash ? parseKeu1Money(freeCashValue) : null;
  return {
    grandTotal,
    hasFreeCash,
    freeCash,
    kebutuhanDana: Math.max(0, grandTotal - (freeCash ?? 0)),
  };
}

export function validateKeu1SubmissionItems(value: unknown): Keu1SubmissionValidationIssue[] {
  const rows = normalizeKeu1SubmissionItems(value);
  if (rows.length === 0) {
    return [{ index: 0, field: "keterangan", message: "Tambahkan minimal satu rincian dana." }];
  }

  return rows.flatMap((row, index) => {
    const issues: Keu1SubmissionValidationIssue[] = [];
    if (!text(row.keterangan)) issues.push({ index, field: "keterangan", message: `Keterangan item ${index + 1} wajib diisi.` });
    if (parseKeu1Quantity(row.jumlah) === null) issues.push({ index, field: "jumlah", message: `Jumlah item ${index + 1} wajib berupa angka bulat minimal 1.` });
    if (!text(row.satuan)) issues.push({ index, field: "satuan", message: `Satuan item ${index + 1} wajib diisi.` });
    if (parseKeu1Money(row.estimasi_harga_satuan) === null) issues.push({ index, field: "estimasi_harga_satuan", message: `Estimasi harga satuan item ${index + 1} wajib diisi.` });
    return issues;
  });
}
