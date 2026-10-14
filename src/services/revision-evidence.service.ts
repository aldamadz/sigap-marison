import { supabase } from "@/lib/supabase";
import type { RequesterRevisionSnapshot } from "@/lib/requester-revision-summary";

export type RevisionEventEvidence = {
  id: string; surat_id?: string; actor_id?: string; actor_name?: string | null;
};
export type RevisionHistoryEvidence = {
  id: string; revision_event_id: string; requested_by: string; submitted_by: string;
  submitted_at: string; reason: string; requester_note?: string | null;
  before_snapshot: Record<string, unknown>; after_snapshot: Record<string, unknown>;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function revisionSnapshotForDisplay(snapshot: Record<string, unknown>): RequesterRevisionSnapshot {
  const document = record(snapshot.document);
  return {
    formData: {
      form_input_data: record(document.form_input_data),
      ...Object.fromEntries(["judul_surat", "request_place", "request_date"]
        .filter(key => key in document).map(key => [key, document[key]])),
    },
    attachments: Array.isArray(snapshot.attachments) ? snapshot.attachments.map(record) : [],
  };
}

export function revisionSubmitterName(history: RevisionHistoryEvidence): string | undefined {
  const document = record(history.after_snapshot.document);
  if (document.created_by !== history.submitted_by) return undefined;
  const snapshot = record(document.data_snapshot);
  const requester = Object.keys(record(snapshot.requester)).length
    ? record(snapshot.requester) : record(document.requester_snapshot);
  return typeof requester.full_name === "string" ? requester.full_name.trim() || undefined : undefined;
}

export async function getRevisionEvidence(suratId: string) {
  const eventsPromise = supabase.rpc("get_surat_revision_history", { p_surat_id: suratId });
  const histories: RevisionHistoryEvidence[] = [];
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase.from("surat_requester_revision_history")
      .select("id,revision_event_id,requested_by,submitted_by,submitted_at,reason,requester_note,before_snapshot,after_snapshot")
      .eq("surat_id", suratId).order("submitted_at", { ascending: true }).order("id", { ascending: true })
      .range(page * 100, page * 100 + 99);
    if (error) throw error;
    const batch = (data || []) as RevisionHistoryEvidence[];
    histories.push(...batch);
    if (batch.length < 100) {
      const events = await eventsPromise;
      if (events.error) throw events.error;
      return { events: (events.data || []) as RevisionEventEvidence[], histories };
    }
  }
  throw new Error("Riwayat revisi terlalu besar untuk ditampilkan secara lengkap.");
}
