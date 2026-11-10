import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AppDialogProvider } from '@/components/app/AppDialogProvider';
import { SignerRevisionEditor } from '@/components/surat/SignerRevisionEditor';
import { SignerRevisionSummary } from '@/components/surat/SignerRevisionSummary';
import { normalizeSignerRevisionForm, signerRevisionForm, signerRevisionIssue } from '@/lib/signer-revision-form';

afterEach(cleanup);
const document = {
  judul_surat: 'Perangkat kantor', request_place: 'Magelang', request_date: '2026-11-10',
  form_input_data: { request_category: 'asset', allocated_units: [{ id: 'protected' }], items: [
    { id: 'a', nama_barang: 'Komputer awal', jumlah: 5, sat: 'Unit', status: '2', spesifikasi: 'RAM 8GB' },
    { id: 'b', nama_barang: 'Monitor lama', jumlah: 1, sat: 'Unit', status: '2' },
  ] },
};
function Harness() {
  const [value, setValue] = useState(() => signerRevisionForm(document));
  return <AppDialogProvider><SignerRevisionEditor value={value} form={{}} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></AppDialogProvider>;
}
const current = () => JSON.parse(screen.getByTestId('value').textContent || '{}');

describe('Full signer revision', () => {
  it('edits all existing item fields without mutating the original or examination data', () => {
    render(<Harness />);
    const first = within(screen.getByRole('group', { name: 'Item 1' }));
    fireEvent.change(first.getByLabelText(/nama barang/i), { target: { value: 'Komputer desain' } });
    fireEvent.change(first.getByLabelText(/jumlah/i), { target: { value: '2.5' } });
    fireEvent.change(first.getByLabelText(/spesifikasi/i), { target: { value: 'RAM 32GB' } });
    expect(current().form_input_data.items[0]).toMatchObject({ nama_barang: 'Komputer desain', jumlah: '2.5', spesifikasi: 'RAM 32GB', id: 'a' });
    expect(current().form_input_data.allocated_units).toEqual([{ id: 'protected' }]);
    expect(screen.queryByLabelText(/allocated|snapshot|id$/i)).not.toBeInTheDocument();
    expect(document.form_input_data.items[0].nama_barang).toBe('Komputer awal');
  });
  it('adds items and confirms deletion before including it in a proposal', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Tambah item' }));
    expect(current().form_input_data.items).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus item 2' }));
    expect(current().form_input_data.items).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus item' }));
    await waitFor(() => expect(current().form_input_data.items).toHaveLength(2));
  });
  it('normalizes decimals and rejects invalid quantities', () => {
    const form = signerRevisionForm(document);
    form.form_input_data.items = [{ nama_barang: 'Pasir', jumlah: '1.25', sat: 'm3' }];
    expect(normalizeSignerRevisionForm(form, {}).form_input_data.items).toEqual([{ nama_barang: 'Pasir', jumlah: 1.25, sat: 'm3' }]);
    expect(signerRevisionIssue(form, {})).toBeUndefined();
    form.form_input_data.items = [{ nama_barang: 'Pasir', jumlah: '0' }];
    expect(signerRevisionIssue(form, {})).toContain('Jumlah');
  });
  it('reuses Fund and KEU financial calculations instead of retaining a stale amount', () => {
    const form = signerRevisionForm(document);
    form.form_input_data = { fund_amount: 999, items: [{ nama_barang: 'Servis', jumlah: 1, satuan: 'Unit', nominal: 100000, status: '2' }] };
    expect(normalizeSignerRevisionForm(form, {}).form_input_data.fund_amount).toBe(100000);
    form.form_input_data = { fund_amount: 999, free_cash_sisa_bulan_lalu: 20000, items: [{ keterangan: 'Servis', jumlah: 1.5, satuan: 'Unit', estimasi_harga_satuan: 100000 }] };
    expect(normalizeSignerRevisionForm(form, { nomor_form: 'FM-UAI.KEU-01-00' }).form_input_data.fund_amount).toBe(130000);
  });
  it('shows full pending proposal differences including additions, removals and specifications', () => {
    const before = signerRevisionForm(document);
    const after = signerRevisionForm(document);
    after.form_input_data.items = [
      { id: 'a', nama_barang: 'Komputer desain', jumlah: 2.5, sat: 'Paket', status: '3', spesifikasi: 'RAM 32GB' },
      { id: 'c', nama_barang: 'Keyboard baru', jumlah: 1, sat: 'Unit' },
    ];
    render(<SignerRevisionSummary revision={{ reason: 'Kebutuhan diperbarui.', changes: {
      signer_revision_required: true, signer_full_proposal: true,
      signer_proposal_before: { document: before }, signer_proposal_after: { document: after },
    } }} />);
    const text = screen.getByRole('region', { name: 'Catatan perbaikan pengajuan' }).textContent;
    for (const expected of ['Komputer desain', 'Komputer awal', 'RAM 8GB', 'RAM 32GB', '2.5', 'Keyboard baru', 'Monitor lama', 'Dihapus']) expect(text).toContain(expected);
  });
});
