import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppDialog } from '@/components/app/AppDialogProvider';
import { FundSubmissionEditor } from './FundSubmissionEditor';
import { Keu1SubmissionEditor } from './Keu1SubmissionEditor';
import { Keu10SubmissionEditor } from './Keu10SubmissionEditor';
import { isKeu1Form } from '@/features/surat/registration/lib/keu1-form';
import { isKeu10Form } from '@/features/surat/registration/lib/keu10-form';
import { FUND_SUBMISSION_TYPES } from '@/features/surat/registration/usages/fund/fund-types';
import { humanizeInputKey } from './request-summary';
import { revisionRecord, type SignerRevisionForm } from '@/lib/signer-revision-form';
import { PGD_ITEM_STATUSES } from './pgd-item-status';

type Props = { value: SignerRevisionForm; form: unknown; onChange: (value: SignerRevisionForm) => void };
const protectedKey = /(^id$|_id$|^__|^allocated_|^verification_|^checker_|url|path|snapshot|^total$)/i;
const scalar = (value: unknown) => value == null || ['string', 'number', 'boolean'].includes(typeof value);

export function SignerRevisionEditor({ value, form, onChange }: Props) {
  const dialog = useAppDialog();
  const input = value.form_input_data;
  const model = revisionRecord(form);
  const rows = Array.isArray(input.items) ? input.items.map(revisionRecord) : [];
  const columns = [...new Set(['nama_barang', 'jumlah', 'sat', 'status', 'keterangan', ...rows.flatMap(row => Object.keys(row))])]
    .filter(key => !protectedKey.test(key) && rows.every(row => scalar(row[key])));
  const updateInput = (key: string, next: unknown) => onChange({ ...value, form_input_data: { ...input, [key]: next } });
  const updateItem = (index: number, key: string, next: unknown) => updateInput('items', rows.map((row, at) => at === index ? { ...row, [key]: next } : row));
  const updateFinancialItems = async (items: unknown[]) => {
    if (items.length < rows.length && !await dialog.confirm({ title: 'Hapus item dari usulan?', description: 'Item akan dihapus hanya setelah pemohon mengonfirmasi usulan revisi.', confirmText: 'Hapus item' })) return;
    updateInput('items', items);
  };
  const remove = async (index: number) => {
    if (await dialog.confirm({ title: 'Hapus item dari usulan?', description: 'Item akan dihapus hanya setelah pemohon mengonfirmasi usulan revisi.', confirmText: 'Hapus item' })) {
      updateInput('items', rows.filter((_, at) => at !== index));
    }
  };
  return <section className="space-y-4" aria-label="Isi revisi penandatangan">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="signer-proposal-title">Perihal</Label><Textarea id="signer-proposal-title" value={value.judul_surat} onChange={e => onChange({ ...value, judul_surat: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="signer-proposal-place">Tempat</Label><Input id="signer-proposal-place" value={value.request_place} onChange={e => onChange({ ...value, request_place: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="signer-proposal-date">Tanggal</Label><Input id="signer-proposal-date" type="date" value={value.request_date} onChange={e => onChange({ ...value, request_date: e.target.value })} /></div>
    </div>
    {isKeu10Form(model) ? <Keu10SubmissionEditor value={input.items} onChange={items => void updateFinancialItems(items)} />
      : isKeu1Form(model) ? <Keu1SubmissionEditor value={input.items} freeCashValue={input.free_cash_sisa_bulan_lalu}
        onChange={items => void updateFinancialItems(items)} onFreeCashChange={next => updateInput('free_cash_sisa_bulan_lalu', next)} />
      : 'fund_amount' in input ? <FundSubmissionEditor value={input.items} onChange={items => void updateFinancialItems(items)} />
      : <div className="space-y-3">
        {rows.map((row, index) => <fieldset key={String(row.id || index)} className="min-w-0 space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Item {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">{columns.map(key => <div key={key} className="min-w-0 space-y-2">
            <Label htmlFor={`signer-item-${index}-${key}`}>{humanizeInputKey(key)}</Label>
            {typeof row[key] === 'boolean' ? <Checkbox id={`signer-item-${index}-${key}`} checked={row[key] === true} onCheckedChange={next => updateItem(index, key, next === true)} />
              : key === 'status' ? <Select value={String(row[key] || '')} onValueChange={next => updateItem(index, key, next)}><SelectTrigger id={`signer-item-${index}-${key}`}><SelectValue placeholder="Pilih status" /></SelectTrigger><SelectContent>{PGD_ITEM_STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
              : /spesifikasi|keterangan|uraian|catatan/.test(key) ? <Textarea id={`signer-item-${index}-${key}`} value={String(row[key] ?? '')} onChange={e => updateItem(index, key, e.target.value)} />
              : <Input id={`signer-item-${index}-${key}`} value={String(row[key] ?? '')} inputMode={key === 'jumlah' ? 'decimal' : undefined}
                onChange={e => updateItem(index, key, e.target.value)} />}
          </div>)}</div>
          <Button type="button" variant="ghost" size="sm" disabled={rows.length <= 1} onClick={() => void remove(index)}><Trash2 className="mr-2 h-4 w-4" />Hapus item {index + 1}</Button>
        </fieldset>)}
        <Button type="button" variant="outline" onClick={() => updateInput('items', [...rows, { nama_barang: '', jumlah: '1', sat: 'Unit', status: '', keterangan: '' }])}><Plus className="mr-2 h-4 w-4" />Tambah item</Button>
      </div>}
    {input.request_category === 'unit' && <div className="space-y-2"><Label htmlFor="signer-unit-count">Jumlah unit diminta</Label><Input id="signer-unit-count" type="number" min="1" step="1" value={String(input.requested_unit_count || '')} onChange={e => updateInput('requested_unit_count', e.target.value)} /></div>}
    {'fund_type' in input && !isKeu1Form(model) && !isKeu10Form(model) && <div className="space-y-2"><Label htmlFor="signer-fund-type">Jenis dana</Label><Select value={String(input.fund_type)} onValueChange={next => updateInput('fund_type', next)}><SelectTrigger id="signer-fund-type"><SelectValue /></SelectTrigger><SelectContent>{FUND_SUBMISSION_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>}
    {'rab_not_required' in input && <div className="flex items-center gap-2"><Checkbox id="signer-no-rab" checked={input.rab_not_required === true} onCheckedChange={next => updateInput('rab_not_required', next === true)} /><Label htmlFor="signer-no-rab">Tidak memerlukan RAB</Label></div>}
    <div className="space-y-2"><Label htmlFor="signer-proposal-note">Catatan pengajuan</Label><Textarea id="signer-proposal-note" value={String(input.catatan || '')} onChange={e => updateInput('catatan', e.target.value)} /></div>
  </section>;
}
