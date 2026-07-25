import { Badge } from "@/components/ui/badge";
import { formatSummaryValue } from "@/components/surat/request-summary";
import { approvalBadgeClass } from "@/components/surat/approval-status-style";
import { cn } from "@/lib/utils";
import { parseRupiahInteger } from "@/lib/rupiah";
import { buildProductionCode } from "@/lib/production-code";

type UnitAllocationSummaryProps = {
  units: unknown;
  project?: unknown;
  requestedCount?: unknown;
  compact?: boolean;
  className?: string;
};

type AllocationUnit = {
  value?: unknown;
  label?: unknown;
  code?: unknown;
  name?: unknown;
  raw?: Record<string, unknown>;
  allocation_detail?: Record<string, unknown>;
};

const asUnitRows = (value: unknown): AllocationUnit[] => Array.isArray(value)
  ? value.filter((item): item is AllocationUnit => Boolean(item) && typeof item === "object" && !Array.isArray(item))
  : [];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const formatDate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatMoney = (value: unknown) => {
  const amount = parseMoney(value);
  if (!Number.isFinite(amount) || amount === 0) return "-";
  return amount.toLocaleString("id-ID");
};

const parseMoney = (value: unknown) => {
  return parseRupiahInteger(value);
};

const getUnitLabel = (unit: AllocationUnit) => {
  const raw = asRecord(unit.raw);
  return formatSummaryValue(unit.label || unit.value || unit.code || unit.name || raw.code || raw.name);
};

const getProjectLabel = (project: unknown) => {
  const record = asRecord(project);
  return formatSummaryValue(record.name || record.label || record.code || project);
};

const getProductionCode = (detail: Record<string, unknown>) => {
  const block = String(detail.production_block || "").trim();
  const date = formatDate(detail.production_date);
  return buildProductionCode({ serial: detail.production_serial, block, date });
};

export function UnitAllocationSummary({ units, project, requestedCount, compact, className }: UnitAllocationSummaryProps) {
  const rows = asUnitRows(units);
  if (rows.length === 0) return null;

  const projectLabel = getProjectLabel(project);
  const requested = Number(requestedCount || 0);
  const adendumTotals = rows.reduce(
    (acc, unit) => {
      const detail = asRecord(unit.allocation_detail);
      const atas = parseMoney(detail.struktur_atas);
      const bawah = parseMoney(detail.struktur_bawah);
      acc.atas += atas;
      acc.bawah += bawah;
      acc.nominal += atas + bawah;
      return acc;
    },
    { atas: 0, bawah: 0, nominal: 0 },
  );

  return (
    <section className={cn("rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Kavling yang dipilih</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Kode produksi unit dan rekap adendum ditampilkan langsung agar penanda tangan tidak wajib membuka lampiran PDF.
          </p>
        </div>
        <Badge variant="outline" className={approvalBadgeClass("verification_done", "shrink-0")}>
          {rows.length}{requested > 0 ? `/${requested}` : ""} unit
        </Badge>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium text-muted-foreground">Proyek</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{projectLabel}</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/70 p-3">
          <p className="text-xs font-medium text-muted-foreground">Kavling dipilih</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {rows.length}{requested > 0 ? ` dari ${requested}` : ""} unit
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
            Kode Produksi Unit
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-center">No.</th>
                  <th className="px-3 py-2">Proyek</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Tipe</th>
                  <th className="px-3 py-2">Kode Produksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((unit, index) => {
                  const detail = asRecord(unit.allocation_detail);
                  return (
                    <tr key={`${getUnitLabel(unit)}-${index}`} className="border-t border-border">
                      <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                      <td className="px-3 py-2">{projectLabel}</td>
                      <td className="px-3 py-2 font-semibold">{getUnitLabel(unit)}</td>
                      <td className="px-3 py-2">{formatSummaryValue(detail.unit_type || asRecord(unit.raw).type)}</td>
                      <td className="px-3 py-2 font-mono">{getProductionCode(detail) || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
            Rekap Adendum Unit
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-center">No.</th>
                  <th className="px-3 py-2">Kavling</th>
                  <th className="px-3 py-2 text-right">Struktur Atas</th>
                  <th className="px-3 py-2 text-right">Struktur Bawah</th>
                  {!compact && <th className="px-3 py-2 text-right">Nominal</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((unit, index) => {
                  const detail = asRecord(unit.allocation_detail);
                  const atas = parseMoney(detail.struktur_atas);
                  const bawah = parseMoney(detail.struktur_bawah);
                  const total = atas + bawah;
                  return (
                    <tr key={`${getUnitLabel(unit)}-adendum-${index}`} className="border-t border-border">
                      <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold">{getUnitLabel(unit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(detail.struktur_atas)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(detail.struktur_bawah)}</td>
                      {!compact && <td className="px-3 py-2 text-right font-semibold tabular-nums">{total > 0 ? total.toLocaleString("id-ID") : "-"}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold text-foreground">
                  <td className="px-3 py-2 text-center" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(adendumTotals.atas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(adendumTotals.bawah)}</td>
                  {!compact && (
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(adendumTotals.nominal)}</td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function UnitAllocationPendingNotice({ className }: { className?: string }) {
  return (
    <section className={cn("rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-4", className)}>
      <p className="text-sm font-semibold text-foreground">Kavling belum dipilih</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Tim pemeriksa belum menyimpan kavling/unit untuk pengajuan ini. Setelah dipilih, detail kavling, kode produksi, dan rekap adendum akan tampil di sini.
      </p>
    </section>
  );
}
