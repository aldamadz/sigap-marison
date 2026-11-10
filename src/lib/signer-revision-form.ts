import { parseItemQuantity } from '@sigap/shared';
import { getFundSubmissionAmount, normalizeFundSubmissionItems, validateFundSubmissionItems } from '@/components/surat/fund-submission';
import { getKeu1FinancialSummary, normalizeKeu1SubmissionItems, validateKeu1SubmissionItems } from '@/components/surat/keu1-submission';
import { isKeu1Form } from '@/features/surat/registration/lib/keu1-form';
import { getKeu10SubmissionAmount, isKeu10Form, normalizeKeu10SubmissionItems, validateKeu10SubmissionItems } from '@/features/surat/registration/lib/keu10-form';

export const revisionRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export type SignerRevisionForm = {
  judul_surat: string;
  request_place: string;
  request_date: string;
  form_input_data: Record<string, unknown>;
};

export function signerRevisionForm(document: unknown): SignerRevisionForm {
  const doc = revisionRecord(document);
  return structuredClone({
    judul_surat: String(doc.judul_surat || ''),
    request_place: String(doc.request_place || ''),
    request_date: String(doc.request_date || '').slice(0, 10),
    form_input_data: revisionRecord(doc.form_input_data || revisionRecord(doc.data_snapshot).input),
  });
}

export function normalizeSignerRevisionForm(value: SignerRevisionForm, form: unknown) {
  const result = structuredClone(value);
  const input = result.form_input_data;
  const model = revisionRecord(form);
  if (isKeu10Form(model)) {
    input.items = normalizeKeu10SubmissionItems(input.items);
    input.fund_amount = getKeu10SubmissionAmount(input.items);
  } else if (isKeu1Form(model)) {
    input.items = normalizeKeu1SubmissionItems(input.items);
    const financial = getKeu1FinancialSummary(input.items, input.free_cash_sisa_bulan_lalu);
    input.fund_amount = financial.kebutuhanDana;
    if (!financial.hasFreeCash) delete input.free_cash_sisa_bulan_lalu;
  } else if ('fund_amount' in input) {
    input.items = normalizeFundSubmissionItems(input.items);
    input.fund_amount = getFundSubmissionAmount(input.items);
  } else if (Array.isArray(input.items)) {
    input.items = input.items.map(value => {
      const row = { ...revisionRecord(value) };
      if ('jumlah' in row) row.jumlah = parseItemQuantity(row.jumlah) ?? row.jumlah;
      return row;
    });
  }
  return result;
}

export function signerRevisionIssue(value: SignerRevisionForm, form: unknown): string | undefined {
  const input = value.form_input_data;
  const model = revisionRecord(form);
  if (isKeu10Form(model)) return validateKeu10SubmissionItems(input.items)[0]?.message;
  if (isKeu1Form(model)) return validateKeu1SubmissionItems(input.items)[0]?.message;
  if ('fund_amount' in input) return validateFundSubmissionItems(input.items)[0]?.message;
  if (Array.isArray(input.items)) {
    if (!input.items.length) return 'Minimal satu item pengajuan wajib dipertahankan.';
    for (const [index, value] of input.items.entries()) {
      const row = revisionRecord(value);
      if ('jumlah' in row && parseItemQuantity(row.jumlah) === null) return `Jumlah item ${index + 1} belum valid.`;
      if ('nama_barang' in row && !String(row.nama_barang || '').trim()) return `Nama item ${index + 1} wajib diisi.`;
    }
  }
  if (input.request_category === 'unit' && !/^[1-9][0-9]*$/.test(String(input.requested_unit_count || ''))) {
    return 'Jumlah unit wajib berupa bilangan bulat positif.';
  }
}
