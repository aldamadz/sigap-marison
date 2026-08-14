import { ArrowRight, CheckCircle2, MapPin, UserRound, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DecisionDetail = {
  id: string;
  name: string;
  quantity: number | null;
  action: string;
  description: string;
};

export type RecommendationDecision = {
  id: string;
  applicantName: string;
  applicantQuantity: number | null;
  recommended: boolean;
  rejectionReason: string;
  location: string;
  pic: string;
  details: DecisionDetail[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record).filter((item) => Object.keys(item).length > 0) : [];
const text = (...values: unknown[]) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;

export const recommendationActionLabel = (value: unknown) => {
  const action = text(value).toLowerCase();
  if (["service", "servis"].includes(action)) return "Servis";
  if (["replace", "replacement", "ganti"].includes(action)) return "Ganti";
  if (["purchase_new", "beli_baru", "beli baru"].includes(action)) return "Beli baru";
  return "Tindakan rekomendasi";
};

export const buildRecommendationDecisions = (value: unknown): RecommendationDecision[] => {
  const model = record(value);
  return rows(model.items).map((item, itemIndex) => {
    const original = record(item.applicant_original);
    const status = text(item.status, item.recommendation_status).toLowerCase().replace(/[\s-]+/g, "_");
    const recommended = !["not_recommended", "tidak_direkomendasikan", "rejected", "ditolak"].includes(status)
      && item.is_recommended !== false;
    return {
      id: text(item.id, `decision-${itemIndex + 1}`),
      applicantName: text(original.name, item.parent_item_name, item.nama_barang, `Item ${itemIndex + 1}`),
      applicantQuantity: numberOrNull(original.quantity ?? item.parent_item_quantity),
      recommended,
      rejectionReason: recommended ? "" : text(item.rejection_reason, item.reason, item.alasan, item.keterangan),
      location: text(item.location, item.lokasi),
      pic: text(item.pic, item.person_in_charge),
      // A rejected parent is authoritative; ignore stale details left by an
      // earlier recommended edit.
      details: recommended ? rows(item.details).map((detail, detailIndex) => ({
        id: text(detail.id, `${text(item.id, `decision-${itemIndex + 1}`)}-detail-${detailIndex + 1}`),
        name: text(detail.name, detail.heading, detail.nama_barang, `Detail ${detailIndex + 1}`),
        quantity: numberOrNull(detail.quantity ?? detail.jumlah),
        action: recommendationActionLabel(detail.action ?? detail.recommendation_action),
        description: text(detail.description, detail.notes, detail.keterangan),
      })) : [],
    };
  });
};

export function RecommendationDecisionSummary({ value }: { value: unknown }) {
  const decisions = buildRecommendationDecisions(value);
  if (decisions.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3" data-testid="recommendation-decision-summary">
      <div>
        <p className="text-xs font-semibold text-foreground">Keputusan tim rekomendasi</p>
        <p className="mt-1 text-xs text-muted-foreground">Pengajuan asli tetap ditampilkan di atas sebagai riwayat. Bagian ini adalah hasil akhirnya.</p>
      </div>
      {decisions.map((decision, index) => (
        <div key={decision.id} className={cn(
          "rounded-lg border p-3",
          decision.recommended ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-red-500/30 bg-red-500/[0.06]",
        )}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Item pengajuan {index + 1}</p>
              <p className="mt-1 text-sm font-semibold">{decision.applicantName}{decision.applicantQuantity != null ? ` · ${decision.applicantQuantity}` : ""}</p>
            </div>
            <Badge variant="outline" className={cn(
              decision.recommended ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-red-500/40 text-red-700 dark:text-red-300",
            )}>
              {decision.recommended ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
              {decision.recommended ? "Direkomendasikan" : "Tidak direkomendasikan"}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {decision.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{decision.location}</span>}
            {decision.pic && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{decision.pic}</span>}
          </div>
          {!decision.recommended && (
            <div className="mt-3 rounded-md border border-red-500/20 bg-background/60 p-2 text-xs">
              <span className="font-semibold">Alasan: </span>{decision.rejectionReason || "Alasan belum dicatat."}
            </div>
          )}
          {decision.recommended && decision.details.length > 0 && (
            <div className="mt-3 space-y-2">
              {decision.details.map((detail) => (
                <div key={detail.id} className="grid gap-2 rounded-md border border-emerald-500/20 bg-background/60 p-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowRight className="h-3.5 w-3.5" /><span>{detail.action}</span></div>
                    <p className="mt-1 text-sm font-semibold">{detail.name}{detail.quantity != null ? ` · ${detail.quantity}` : ""}</p>
                    {detail.description && <p className="mt-1 text-xs text-muted-foreground">{detail.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
