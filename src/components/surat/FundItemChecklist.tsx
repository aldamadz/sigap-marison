import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { matchesFundItemSnapshot, readFundItemChecks } from "@/features/surat/inbox/lib/checker-input";

type Props = { items: Record<string, unknown>[]; value: unknown; readOnly: boolean; onChange(value: string): void };
export function FundItemChecklist({ items, value, readOnly, onChange }: Props) {
  const saved = readFundItemChecks(value);
  const checks = items.map((item, index) => {
    const previous = saved.find(check => check.item_index === index && matchesFundItemSnapshot(check.item, item));
    return { item_index: index, item, checked: previous?.checked ?? false, note: previous?.note ?? "" };
  });
  const update = (index: number, patch: { checked?: boolean; note?: string }) =>
    onChange(JSON.stringify(checks.map((check, position) => position === index ? { ...check, ...patch } : check)));
  return <section className="sigap-panel space-y-3">
    <h3 className="text-sm font-semibold">Pemeriksaan item dana</h3>
    <div className="divide-y divide-border">
      {items.map((item, index) => <div key={index} className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr]">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={checks[index].checked} disabled={readOnly} onCheckedChange={checked => update(index, { checked: checked === true })} aria-label={`Item ${index + 1} sudah diperiksa`} />
          <span>{index + 1}. {String(item.nama_barang || item.keterangan || item.item_name || `Item ${index + 1}`)}</span>
        </label>
        <Textarea value={checks[index].note} readOnly={readOnly} onChange={event => update(index, { note: event.target.value })} aria-label={`Catatan pemeriksaan item ${index + 1}`} placeholder="Catatan item (opsional)" maxLength={2000} className="min-h-16" />
      </div>)}
    </div>
  </section>;
}
