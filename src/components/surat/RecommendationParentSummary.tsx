import { AlertTriangle, Building2, FileText, Loader2, MapPin, RefreshCcw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLongDate, formatRequestCategory, formatSummaryValue, humanizeInputKey } from "@/components/surat/request-summary";
import type { RecommendationParentSummary as ParentSummary } from "@/services/surat.service";

type Props = {
  data: ParentSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

const hiddenKeys = new Set([
  "request_mode",
  "request_category",
  "requires_recommendation",
  "recommendation_template_name",
  "recommendation_attachment_note",
  "unit_config_snapshot",
]);

const getVisibleDetails = (input: Record<string, unknown>) => Object.entries(input)
  .filter(([key, value]) => !hiddenKeys.has(key) && formatSummaryValue(value) !== "-");

const itemColumns = [
  { key: "nama_barang", label: "Nama Barang", getValue: (row: Record<string, unknown>) => row.nama_barang || row.nama || row.barang },
  { key: "sat", label: "Satuan", getValue: (row: Record<string, unknown>) => row.sat || row.satuan || row.unit },
  { key: "jumlah", label: "Jumlah", getValue: (row: Record<string, unknown>) => row.jumlah },
  { key: "status", label: "Status", getValue: (row: Record<string, unknown>) => row.status },
  { key: "keterangan", label: "Keterangan", getValue: (row: Record<string, unknown>) => row.keterangan },
];

const ItemTable = ({ rows }: { rows: Array<Record<string, unknown>> }) => {
  const columns = itemColumns.filter((column) =>
    column.key !== "keterangan" ||
    rows.some((row) => formatSummaryValue(column.getValue(row)) !== "-")
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="w-12 px-3 py-2 text-center">No.</th>
            {columns.map((column) => <th key={column.key} className="px-3 py-2 font-semibold">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
              {columns.map((column) => (
                <td key={column.key} className="max-w-72 whitespace-pre-wrap px-3 py-2 align-top">
                  {formatSummaryValue(column.getValue(row))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export function RecommendationParentSummary({ data, loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <section className="rounded-lg border border-border bg-muted/15 p-4" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Memuat pengajuan induk
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-foreground">Pengajuan induk belum dapat dimuat</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || "Coba muat ulang ringkasan pengajuan."}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry}>
          <RefreshCcw className="h-4 w-4" /> Coba lagi
        </Button>
      </section>
    );
  }

  const details = getVisibleDetails(data.form_input_data || {});

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <header className="border-b border-border bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-primary">{data.no_surat || "Nomor tidak tersedia"}</p>
            <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">{data.judul_surat || "Pengajuan aset"}</h3>
          </div>
          <span className="w-fit rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {formatRequestCategory(data.request_category)}
          </span>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [UserRound, "Pemohon", data.requester_name, data.requester_job_title],
            [Building2, "Departemen", data.department_name, data.department_code],
            [MapPin, "Kantor", data.office_name, data.project_name],
            [FileText, "Tempat, tanggal", data.request_place, formatLongDate(data.request_date || "")],
          ].map(([Icon, label, value, detail]) => {
            const ItemIcon = Icon as typeof UserRound;
            return (
              <div key={String(label)} className="min-w-0 rounded-md border border-border p-3">
                <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ItemIcon className="h-3.5 w-3.5" />{String(label)}</dt>
                <dd className="mt-2 truncate text-sm font-semibold text-foreground">{String(value || "-")}</dd>
                {detail && <dd className="mt-1 truncate text-xs text-muted-foreground">{String(detail)}</dd>}
              </div>
            );
          })}
        </dl>

        {details.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Isi pengajuan</h4>
            {details.map(([key, value]) => Array.isArray(value) && value.every((row) => row && typeof row === "object" && !Array.isArray(row)) ? (
              <div key={key} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{humanizeInputKey(key)}</p>
                <ItemTable rows={value as Array<Record<string, unknown>>} />
              </div>
            ) : (
              <div key={key} className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:grid-cols-[180px_1fr]">
                <p className="text-xs font-medium text-muted-foreground">{humanizeInputKey(key)}</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{formatSummaryValue(value)}</p>
              </div>
            ))}
          </div>
        )}

        {data.attachments.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-foreground">Lampiran pengajuan</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.attachments.map((attachment) => (
                <span key={attachment.id} className="max-w-full truncate rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground">
                  {attachment.requirement_label || attachment.file_name || "Lampiran"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
