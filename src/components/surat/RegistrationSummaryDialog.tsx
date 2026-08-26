import { Fragment } from "react";
import { ExternalLink, FileCheck2, FileText, Image as ImageIcon, Loader2, Paperclip, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  formatLongDate,
  formatRequestCategory,
  formatSummaryValue,
  getSafeExternalUrl,
  humanizeInputKey,
} from "@/components/surat/request-summary";
import { UnitAllocationPendingNotice, UnitAllocationSummary } from "@/components/surat/UnitAllocationSummary";
import { cn } from "@/lib/utils";
import { formatRevisionValue as formatTypedRevisionValue } from "@/components/surat/revision-utils";
import {
  formatNonUnitCurrency,
  getNonUnitRowOption,
  getNonUnitTotal,
  isNonUnitRequestRows,
  type NonUnitRequestRow,
} from "@/components/surat/non-unit-request";
import { formatRupiahZero } from "@/lib/rupiah";

export type RegistrationSummaryField = {
  key: string;
  label: string;
  type?: string;
  value: unknown;
};

export type RegistrationSummaryAttachment = {
  id: string;
  name: string;
  type?: string | null;
  size?: number | null;
  label?: string | null;
  fileUrl?: string | null;
};

export type RegistrationSummarySigner = {
  step: number;
  role: string;
  name: string;
  jobTitle?: string;
};

export type RegistrationSummaryData = {
  noSurat: string;
  title: string;
  category: unknown;
  usageName: string;
  formName: string;
  requesterName: string;
  requesterJobTitle?: string;
  departmentName: string;
  officeName: string;
  projectName?: string;
  requestPlace: string;
  requestDate: string;
  fields: RegistrationSummaryField[];
  attachments: RegistrationSummaryAttachment[];
  signers: RegistrationSummarySigner[];
  isRecommendation: boolean;
};

type Props = {
  open: boolean;
  data: RegistrationSummaryData;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

const formatFileSize = (bytes?: number | null) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "Ukuran tidak tersedia";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const asRows = (value: unknown) => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
  : [];

const ITEM_COLUMNS = [
  { key: "nama_barang", label: "Nama Barang", getValue: (row: Record<string, unknown>) => row.nama_barang || row.nama || row.barang },
  { key: "sat", label: "Satuan", getValue: (row: Record<string, unknown>) => row.sat || row.satuan || row.unit },
  { key: "jumlah", label: "Jumlah", getValue: (row: Record<string, unknown>) => row.jumlah },
  { key: "nominal", label: "Nominal", getValue: (row: Record<string, unknown>) => row.nominal },
  { key: "status", label: "Status", getValue: (row: Record<string, unknown>) => row.status },
  { key: "keterangan", label: "Keterangan", getValue: (row: Record<string, unknown>) => row.keterangan },
];
const normalizeFieldKey = (key: string) => key.trim().toLowerCase();

const formatRevisionSummary = (revision: NonNullable<ReturnType<typeof getRowRevision>>, row: Record<string, unknown>) => {
  if (revision.action === "reject") return "Item tidak disetujui.";
  if (revision.action !== "adjust") return null;
  const approved = formatTypedRevisionValue(revision.approvedValue, { value_type: revision.valueType }, row);
  const requested = formatTypedRevisionValue(revision.requestedValue, { value_type: revision.valueType }, row);
  return requested && requested !== "-"
    ? `Nilai disetujui: ${approved} dari ${requested}`
    : `Nilai disetujui: ${approved}`;
};

const getRowRevision = (row: Record<string, unknown>) => {
  const revision = row.__revision && typeof row.__revision === "object" && !Array.isArray(row.__revision)
    ? row.__revision as Record<string, unknown>
    : null;
  const action = String(row.__revision_action || revision?.action || "").trim();
  const reason = String(row.__revision_reason || revision?.alasan || revision?.reason || "").trim();
  const requestedValue = row.__revision_value_requested ?? revision?.nilai_diajukan;
  const approvedValue = row.__revision_value_approved ?? revision?.nilai_disetujui;
  const valueType = String(row.__revision_value_type || revision?.value_type || revision?.revision_value_type || "").trim();
  return action || reason || requestedValue || approvedValue
    ? { action, reason, requestedValue, approvedValue, valueType }
    : null;
};

const AttachmentPreview = ({ row, index }: { row: Record<string, unknown>; index: number }) => {
  const attachment = row.recommendation_attachment && typeof row.recommendation_attachment === "object"
    ? row.recommendation_attachment as Record<string, unknown>
    : null;
  const imageUrl = String(attachment?.file_url || row.recommendation_attachment_url || "").trim();
  const referenceUrl = getSafeExternalUrl(row.reference_link);
  const action = String(row.recommendation_action || "").trim();
  const notRecommended = action === "tidak_direkomendasikan" || row.is_recommended === false;
  const actionLabel = action === "service"
    ? "Service"
    : action === "ganti"
      ? "Ganti Komponen"
      : action === "beli_baru"
        ? "Beli Baru"
        : action === "tidak_direkomendasikan"
          ? "Tidak Direkomendasikan"
          : formatSummaryValue(action);
  const parentItemName = formatSummaryValue(row.parent_item_name);

  return (
    <article className={cn(
      "overflow-hidden rounded-md border bg-background",
      notRecommended ? "border-amber-500/35 bg-amber-500/[0.03]" : "border-border"
    )}>
      <div className="grid gap-4 p-4 md:grid-cols-[160px_1fr]">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Lampiran item rekomendasi ${index + 1}`}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : <ImageIcon className="h-7 w-7 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Item {index + 1}</p>
            <Badge variant={notRecommended ? "outline" : "secondary"} className={cn(notRecommended && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200")}>
              {actionLabel}
            </Badge>
          </div>
          {parentItemName !== "-" && (
            <p className={cn("mt-1 text-sm font-semibold text-foreground", notRecommended && "line-through decoration-2")}>
              {parentItemName}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-foreground">{formatSummaryValue(row.nama_barang)}</p>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            {[
              ["Lokasi / PIC", row.lokasi_pic],
              ["No. Registrasi", row.no_registrasi],
              ["Kerusakan", row.kerusakan],
              ["Rekomendasi", actionLabel],
              ["Uraian", row.uraian],
              [notRecommended ? "Alasan" : "Keterangan", row.keterangan],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{String(label)}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-medium text-foreground">{formatSummaryValue(value)}</dd>
              </div>
            ))}
          </dl>
          {referenceUrl && (
            <a
              href={referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Buka link referensi
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

const TableSummary = ({
  field,
  allocatedProject,
  requestedUnitCount,
}: {
  field: RegistrationSummaryField;
  allocatedProject?: unknown;
  requestedUnitCount?: unknown;
}) => {
  const rows = asRows(field.value);
  if (rows.length === 0) return null;
  const normalizedFieldKey = normalizeFieldKey(field.key);
  if (normalizedFieldKey === "allocated_units") {
    return <UnitAllocationSummary units={field.value} project={allocatedProject} requestedCount={requestedUnitCount} />;
  }
  if (normalizedFieldKey === "recommendation_items") {
    return <div className="space-y-3">{rows.map((row, index) => <AttachmentPreview key={index} row={row} index={index} />)}</div>;
  }
  if (normalizedFieldKey === "items" && isNonUnitRequestRows(rows)) {
    const total = getNonUnitTotal(rows);
    return (
      <div className="overflow-hidden rounded-md border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="w-14 px-3 py-2 text-center">No.</th>
                <th className="px-3 py-2">Jenis Pekerjaan</th>
                <th className="px-3 py-2">Nama Pekerjaan</th>
                <th className="px-3 py-2 text-right">Nilai Pengajuan</th>
                <th className="px-3 py-2">Catatan Perencanaan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rawRow, index) => {
                const row = rawRow as NonUnitRequestRow;
                const option = getNonUnitRowOption(row);
                return (
                  <tr key={index} className="border-t border-border">
                    <td className="px-3 py-3 text-center tabular-nums">{index + 1}</td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold text-foreground">
                        {option?.raw?.code ? `${option.raw.code} - ` : ""}{option?.label || "-"}
                      </p>
                      {option?.raw?.description && (
                        <p className="mt-1 max-w-64 whitespace-pre-wrap text-muted-foreground">{String(option.raw.description)}</p>
                      )}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap px-3 py-3 align-top font-medium text-foreground">
                      {formatSummaryValue(row.item_name || row.nama_barang)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-top font-semibold tabular-nums">
                      {formatNonUnitCurrency(row.subtotal)}
                    </td>
                    <td className="max-w-72 whitespace-pre-wrap px-3 py-3 align-top">
                      {formatSummaryValue(row.planning_notes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-border bg-muted/20">
              <tr>
                <th colSpan={3} className="px-3 py-3 text-right text-xs font-semibold">Total pengajuan</th>
                <th className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums">
                  {formatNonUnitCurrency(total)}
                </th>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }
  if (normalizedFieldKey === "items" || rows.some((row) => formatSummaryValue(row.nama_barang || row.nama || row.barang) !== "-")) {
    const columns = ITEM_COLUMNS.filter((column) =>
      !["keterangan", "nominal"].includes(column.key) ||
      rows.some((row) => formatSummaryValue(column.getValue(row)) !== "-")
    );
    return (
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-center">No.</th>
              {columns.map((column) => <th key={column.key} className="px-3 py-2">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const revision = getRowRevision(row);
              const rejected = revision?.action === "reject";
              const revisionSummary = revision ? formatRevisionSummary(revision, row) : null;
              return (
                <Fragment key={index}>
                  <tr key={`${index}-item`} className={cn("border-t border-border", revision && "bg-amber-500/[0.04]")}>
                    <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
                    {columns.map((column) => (
                      <td key={column.key} className="max-w-72 whitespace-pre-wrap px-3 py-2 align-top">
                        <span className={cn(rejected && "text-muted-foreground line-through decoration-2")}>
                          {column.key === "nominal"
                            ? formatRupiahZero(column.getValue(row))
                            : formatSummaryValue(column.getValue(row))}
                        </span>
                      </td>
                    ))}
                  </tr>
                  {revision && (
                    <tr key={`${index}-revision`} className="border-t border-amber-500/20 bg-amber-500/[0.04]">
                      <td />
                      <td colSpan={columns.length} className="px-3 py-2">
                        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:text-amber-100">
                          {revisionSummary && <p className="font-semibold">{revisionSummary}</p>}
                          {revision.reason && <p className={cn("whitespace-pre-wrap", revisionSummary && "mt-1")}>{revision.reason}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );})}
          </tbody>
        </table>
      </div>
    );
  }
  const excluded = new Set(["recommendation_attachment"]);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((key) => !excluded.has(key) && !key.startsWith("recommendation_attachment_") && rows.some((row) => formatSummaryValue(row[key]) !== "-"));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr><th className="px-3 py-2 text-center">No.</th>{columns.map((key) => <th key={key} className="px-3 py-2">{humanizeInputKey(key)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              <td className="px-3 py-2 text-center tabular-nums">{index + 1}</td>
              {columns.map((key) => <td key={key} className="max-w-64 whitespace-pre-wrap px-3 py-2 align-top">{formatSummaryValue(row[key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export function RegistrationSummaryDocument({
  data,
  onOpenAttachment,
  openingAttachmentId,
}: {
  data: RegistrationSummaryData;
  onOpenAttachment?: (attachment: RegistrationSummaryAttachment) => void;
  openingAttachmentId?: string | null;
}) {
  const allocatedProject = data.fields.find((field) => field.key === "allocated_project")?.value ||
    data.fields.find((field) => field.key === "requested_project")?.value ||
    data.projectName;
  const identityProject = data.projectName || formatSummaryValue(allocatedProject);
  const requestedUnitCount = data.fields.find((field) => field.key === "requested_unit_count")?.value ||
    data.fields.find((field) => field.key === "allocated_unit_count")?.value;
  const detailFields = data.fields.filter((field) => ![
    "requested_project",
    "allocated_project",
    "allocated_unit_count",
    "requested_unit_count",
    "unit_request_sentence",
    "allocated_at",
    "allocated_by_signature_id",
  ].includes(field.key));
  const hasAllocatedUnits = detailFields.some((field) => field.key === "allocated_units" && asRows(field.value).length > 0);
  const isUnitCategory = String(data.category || "").toLowerCase() === "unit";

  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-md border border-border bg-background shadow-sm">
      <header className="border-b-2 border-foreground px-5 py-6 text-center sm:px-8">
        <img
          src="/logo-marison-regency-group.png"
          alt="Marison Regency Group"
          className="mx-auto h-16 w-auto object-contain sm:h-20"
          loading="lazy"
        />
        <h2 className="mt-5 text-lg font-semibold leading-snug text-foreground sm:text-xl">{data.title || "Tanpa judul"}</h2>
        <p className="mt-2 break-words text-sm font-medium tabular-nums text-foreground">{data.noSurat || "Nomor belum tersedia"}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Badge variant="outline">{formatRequestCategory(data.category)}</Badge>
          {data.isRecommendation && <Badge>Dokumen Rekomendasi</Badge>}
        </div>
      </header>

      <div className="space-y-6 p-4 sm:p-7">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Identitas Dokumen</h3>
          <dl className="grid overflow-hidden rounded-md border border-border sm:grid-cols-2">
            {[
              ["Pengaju", data.requesterName, data.requesterJobTitle],
              ["Departemen", data.departmentName, data.officeName],
              ["Form", data.formName, data.usageName],
              ["Tempat, tanggal", `${data.requestPlace}, ${formatLongDate(data.requestDate)}`, identityProject !== "-" ? identityProject : "Tanpa proyek"],
            ].map(([label, value, detail]) => (
              <div key={label} className="border-b border-border p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">{value || "-"}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">{detail || "-"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {(detailFields.length > 0 || isUnitCategory) && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Isi Dokumen</h3>
            {isUnitCategory && !hasAllocatedUnits && <UnitAllocationPendingNotice />}
            {detailFields.map((field) => field.type === "table" || Array.isArray(field.value) ? (
              <div key={field.key} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{field.label}</p>
                <TableSummary field={field} allocatedProject={allocatedProject} requestedUnitCount={requestedUnitCount} />
              </div>
            ) : (
              <div key={field.key} className="rounded-md border border-border p-4">
                <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{formatSummaryValue(field.value)}</p>
              </div>
            ))}
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Paperclip className="h-4 w-4 text-primary" /> Lampiran</h3>
            <div className="space-y-2">
              {data.attachments.length > 0 ? data.attachments.map((attachment) => {
                const opening = openingAttachmentId === attachment.id;
                const canOpen = Boolean(onOpenAttachment && attachment.fileUrl);
                return (
                <div key={attachment.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{attachment.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{attachment.label || attachment.type || "Lampiran"} - {formatFileSize(attachment.size)}</p>
                  </div>
                  {canOpen && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 px-2 text-xs"
                      disabled={opening}
                      onClick={() => onOpenAttachment?.(attachment)}
                    >
                      {opening ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1.5 h-3.5 w-3.5" />}
                      {opening ? "Membuka" : "Buka"}
                    </Button>
                  )}
                </div>
              );}) : <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">Tidak ada lampiran tambahan.</p>}
            </div>
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><UserRound className="h-4 w-4 text-primary" /> Penandatangan</h3>
            <ol className="space-y-2">
              {data.signers.map((signer) => (
                <li key={signer.step} className="flex gap-3 rounded-md border border-border p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{signer.step}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{signer.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{signer.jobTitle || signer.role}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{signer.role}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}

export function RegistrationSummaryDialog({ open, data, submitting, onOpenChange, onConfirm }: Props) {
  const allocatedProject = data.fields.find((field) => field.key === "allocated_project")?.value ||
    data.fields.find((field) => field.key === "requested_project")?.value ||
    data.projectName;
  const identityProject = data.projectName || formatSummaryValue(allocatedProject);
  const requestedUnitCount = data.fields.find((field) => field.key === "requested_unit_count")?.value ||
    data.fields.find((field) => field.key === "allocated_unit_count")?.value;
  const detailFields = data.fields.filter((field) => ![
    "requested_project",
    "allocated_project",
    "allocated_unit_count",
    "requested_unit_count",
    "unit_request_sentence",
    "allocated_at",
    "allocated_by_signature_id",
  ].includes(field.key));
  const hasAllocatedUnits = detailFields.some((field) => field.key === "allocated_units" && asRows(field.value).length > 0);
  const isUnitCategory = String(data.category || "").toLowerCase() === "unit";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left sm:px-7">
          <div className="flex items-start gap-3 pr-8">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold sm:text-lg">Periksa sebelum didaftarkan</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed sm:text-sm">
                Pastikan isi dokumen, lampiran, dan penandatangan sudah sesuai.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 px-3 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-md border border-border bg-background shadow-sm">
            <header className="border-b-2 border-foreground px-5 py-6 text-center sm:px-8">
              <img
                src="/logo-marison-regency-group.png"
                alt="Marison Regency Group"
                className="mx-auto h-16 w-auto object-contain sm:h-20"
                loading="lazy"
              />
              <h2 className="mt-5 text-lg font-semibold leading-snug text-foreground sm:text-xl">{data.title || "Tanpa judul"}</h2>
              <p className="mt-2 break-words text-sm font-medium tabular-nums text-foreground">{data.noSurat || "Nomor belum tersedia"}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Badge variant="outline">{formatRequestCategory(data.category)}</Badge>
                {data.isRecommendation && <Badge>Dokumen Rekomendasi</Badge>}
              </div>
            </header>

            <div className="space-y-6 p-4 sm:p-7">
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Identitas Dokumen</h3>
                <dl className="grid overflow-hidden rounded-md border border-border sm:grid-cols-2">
                  {[
                    ["Pengaju", data.requesterName, data.requesterJobTitle],
                    ["Departemen", data.departmentName, data.officeName],
                    ["Form", data.formName, data.usageName],
                    ["Tempat, tanggal", `${data.requestPlace}, ${formatLongDate(data.requestDate)}`, identityProject !== "-" ? identityProject : "Tanpa proyek"],
                  ].map(([label, value, detail]) => (
                    <div key={label} className="border-b border-border p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
                      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">{value || "-"}</dd>
                      <dd className="mt-1 text-xs text-muted-foreground">{detail || "-"}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {(detailFields.length > 0 || isUnitCategory) && (
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Isi Dokumen</h3>
                  {isUnitCategory && !hasAllocatedUnits && <UnitAllocationPendingNotice />}
                  {detailFields.map((field) => field.type === "table" || Array.isArray(field.value) ? (
                    <div key={field.key} className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">{field.label}</p>
                      <TableSummary field={field} allocatedProject={allocatedProject} requestedUnitCount={requestedUnitCount} />
                    </div>
                  ) : (
                    <div key={field.key} className="rounded-md border border-border p-4">
                      <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{formatSummaryValue(field.value)}</p>
                    </div>
                  ))}
                </section>
              )}

              <section className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Paperclip className="h-4 w-4 text-primary" /> Lampiran</h3>
                  <div className="space-y-2">
                    {data.attachments.length > 0 ? data.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0"><p className="truncate text-xs font-semibold text-foreground">{attachment.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{attachment.label || attachment.type || "Lampiran"} · {formatFileSize(attachment.size)}</p></div>
                      </div>
                    )) : <p className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">Tidak ada lampiran tambahan.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><UserRound className="h-4 w-4 text-primary" /> Penandatangan</h3>
                  <ol className="space-y-2">
                    {data.signers.map((signer) => (
                      <li key={signer.step} className="flex gap-3 rounded-md border border-border p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{signer.step}</span>
                        <div className="min-w-0"><p className="text-xs font-semibold text-foreground">{signer.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{signer.jobTitle || signer.role}</p><p className="mt-0.5 text-xs text-muted-foreground">{signer.role}</p></div>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-7 sm:py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11 sm:min-w-36" disabled={submitting} onClick={() => onOpenChange(false)}>Kembali Perbaiki</Button>
            <Button type="button" className="min-h-11 sm:min-w-56" disabled={submitting} onClick={onConfirm}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mendaftarkan...</> : "Data Sudah Benar, Daftarkan"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
