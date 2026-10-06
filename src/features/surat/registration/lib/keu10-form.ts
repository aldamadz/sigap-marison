import {
  createKeu1SubmissionItem,
  normalizeKeu1SubmissionItems,
  parseKeu1Money,
  parseKeu1Quantity,
  validateKeu1SubmissionItems,
  type Keu1SubmissionItem,
  type Keu1SubmissionValidationIssue,
} from "@/components/surat/keu1-submission";

const KEU10_FORM_NUMBERS = new Set(["FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"]);

export const isKeu10Form = (form: { nomor_form?: string | null } | null | undefined): boolean =>
  KEU10_FORM_NUMBERS.has(String(form?.nomor_form ?? "").trim().toUpperCase());

export type Keu10SubmissionItem = Keu1SubmissionItem;
export const createKeu10SubmissionItem = createKeu1SubmissionItem;

export function getKeu10ItemTotal(row: Keu10SubmissionItem): number | null {
  const quantity = parseKeu1Quantity(row.jumlah);
  const price = parseKeu1Money(row.estimasi_harga_satuan);
  if (quantity === null || price === null) return null;
  const total = quantity * price;
  return Number.isSafeInteger(total) ? total : null;
}

export function normalizeKeu10SubmissionItems(value: unknown): Keu10SubmissionItem[] {
  // Only KEU 10 item fields cross the input boundary; stored totals are never authoritative.
  return normalizeKeu1SubmissionItems(value).map((row) => ({
    id: row.id,
    keterangan: row.keterangan,
    jumlah: row.jumlah,
    satuan: row.satuan,
    estimasi_harga_satuan: row.estimasi_harga_satuan,
    total: getKeu10ItemTotal(row) ?? undefined,
  }));
}

export function getKeu10SubmissionAmount(value: unknown): number | null {
  let total = 0;
  for (const row of normalizeKeu10SubmissionItems(value)) {
    const rowTotal = getKeu10ItemTotal(row);
    if (rowTotal === null && parseKeu1Quantity(row.jumlah) !== null && parseKeu1Money(row.estimasi_harga_satuan) !== null) return null;
    total += rowTotal ?? 0;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function validateKeu10SubmissionItems(value: unknown): Keu1SubmissionValidationIssue[] {
  const rows = normalizeKeu10SubmissionItems(value);
  const issues = validateKeu1SubmissionItems(rows);
  if (rows.length > 100) issues.push({ index: 100, field: "keterangan", message: "Rincian KEU 10 maksimal 100 item." });
  rows.forEach((row, index) => {
    if ((row.keterangan?.length ?? 0) > 240) issues.push({ index, field: "keterangan", message: `Keterangan item ${index + 1} maksimal 240 karakter.` });
    if ((row.satuan?.length ?? 0) > 80) issues.push({ index, field: "satuan", message: `Satuan item ${index + 1} maksimal 80 karakter.` });
    if (parseKeu1Quantity(row.jumlah) !== null && parseKeu1Money(row.estimasi_harga_satuan) !== null && getKeu10ItemTotal(row) === null) {
      issues.push({ index, field: "estimasi_harga_satuan", message: `Total item ${index + 1} melebihi batas angka aman.` });
    }
  });
  if (getKeu10SubmissionAmount(rows) === null) issues.push({ index: 0, field: "estimasi_harga_satuan", message: "Grand Total melebihi batas angka aman." });
  return issues;
}
