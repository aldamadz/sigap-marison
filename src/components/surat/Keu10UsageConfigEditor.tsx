import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Keu10Config } from "@/features/surat/registration/lib/keu10-config";

const DISPOSITIONS = {
  legal_land: "Tanah dan perizinan",
  tactical_land: "Dana taktis pengondisian lahan",
  village_equipment: "Sosialisasi dan perlengkapan desa",
};

export function Keu10UsageConfigEditor({ value, onChange }: { value: Keu10Config; onChange: (value: Keu10Config) => void }) {
  const update = (index: number, label: string) => onChange({
    ...value,
    purposes: value.purposes.map((purpose, i) => i === index ? { ...purpose, label } : purpose),
  });
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Tujuan pengajuan KEU 10</h3>
      <p className="text-sm text-muted-foreground">{DISPOSITIONS[value.disposition]}</p>
      {value.disposition === "tactical_land" && <p className="text-xs text-muted-foreground">Sampai Rp2.000.000: Direktur I. Di atas Rp2.000.000: Direktur Utama.</p>}
      {value.purposes.map((purpose, index) => (
        <div key={purpose.code} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`keu10-purpose-${purpose.code}`}>Tujuan {index + 1}</Label>
            <Input id={`keu10-purpose-${purpose.code}`} value={purpose.label} maxLength={240} onChange={event => update(index, event.target.value)} />
          </div>
          <Button type="button" variant="ghost" size="icon" title="Hapus tujuan" aria-label={`Hapus tujuan ${index + 1}`} disabled={value.purposes.length === 1}
            onClick={() => onChange({ ...value, purposes: value.purposes.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange({ ...value, purposes: [...value.purposes, { code: `purpose_${crypto.randomUUID().replace(/-/g, "")}`, label: "" }] })}>
        <Plus className="mr-2 h-4 w-4" /> Tambah tujuan
      </Button>
    </section>
  );
}
