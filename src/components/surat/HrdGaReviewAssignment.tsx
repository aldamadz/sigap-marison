import { HRD_GA_CATEGORY_KEY, HRD_GA_GROUPS, HRD_GA_LABELS, hrdGaReviewGroup, hrdGaReviewIssue, type HrdGaGroup, type HrdGaReviewConfig } from "@/lib/hrd-ga-review";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { config: HrdGaReviewConfig; items: unknown; frozenGroup?: HrdGaGroup; onChange: (items: Record<string, unknown>[]) => void };
export function HrdGaReviewAssignment({ config, items, frozenGroup, onChange }: Props) {
  const rows = Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const group = hrdGaReviewGroup(rows, frozenGroup);
  const issue = hrdGaReviewIssue(rows, frozenGroup);
  const options = frozenGroup ? [frozenGroup] : HRD_GA_GROUPS;
  return <section className="space-y-3 border-y border-border py-4" aria-labelledby="hrd-ga-review-heading">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 id="hrd-ga-review-heading" className="text-sm font-semibold">Pemeriksaan HRD & GA</h3>
        <p className="mt-1 text-xs text-muted-foreground">Kebutuhan GA dan HRD harus diajukan terpisah.</p></div>
      {rows.length > 1 && <Select value="" onValueChange={value => onChange(rows.map(row => ({ ...row, [HRD_GA_CATEGORY_KEY]: value })))}>
        <SelectTrigger aria-label="Kategori semua item" className="w-full sm:w-72"><SelectValue placeholder="Kategori semua item"/></SelectTrigger>
        <SelectContent>{options.map(value => <SelectItem key={value} value={value}>{HRD_GA_LABELS[value]}</SelectItem>)}</SelectContent>
      </Select>}
    </div>
    {rows.map((row, index) => <div key={String(row.id || index)} className="grid min-w-0 gap-2 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1fr)]">
      <Label htmlFor={`hrd-ga-category-${index}`} className="min-w-0 break-words self-center text-sm">{index + 1}. {String(row.nama_barang || row.keterangan || row.item_name || row.name || `Item ${index + 1}`)}</Label>
      <Select value={String(row[HRD_GA_CATEGORY_KEY] ?? frozenGroup ?? "")} onValueChange={value => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [HRD_GA_CATEGORY_KEY]: value } : item))}>
        <SelectTrigger id={`hrd-ga-category-${index}`} aria-label={`Kategori pemeriksaan item ${index + 1}`} className="h-auto min-h-10 [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Pilih kategori pemeriksaan"/></SelectTrigger>
        <SelectContent>{options.map(value => <SelectItem key={value} value={value}>{HRD_GA_LABELS[value]}</SelectItem>)}</SelectContent>
      </Select>
    </div>)}
    {issue && rows.length > 0 && <p role="alert" className="text-sm text-destructive">{issue}</p>}
    {group && !issue && <p className="text-sm"><span className="text-muted-foreground">Tim pemeriksa: </span><strong>{config.reviewers[group].full_name}</strong></p>}
  </section>;
}
