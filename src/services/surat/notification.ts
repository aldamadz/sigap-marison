import { supabase } from "@/lib/supabase";
import { getVerifierIdsFromSnapshot } from "./form-helpers";

/**
 * Notification methods extracted from suratService.
 *
 * `sendNotification` is self-contained and takes a session from
 * supabase directly. `notifyInboxStepTasks` depends on
 * `sendNotification` and `getVerifierIdsFromSnapshot`; the legacy
 * facade passes a small `deps` object so this module can call back
 * without needing a `this` reference.
 */

export const sendNotification = async (
  userIds: string[],
  title: string,
  message: string,
  link?: string,
  meta: Record<string, any> = {},
) => {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    const { data: { session } } = await supabase.auth.getSession({ force: true });
    if (!session?.access_token) return;
    const response = await fetch("/api/notifications/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_ids: ids, title, message, link, ...meta }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Gagal mengirim notifikasi.");
    }
  } catch (error) {
    console.error("Notification error:", error);
  }
};

type NotifyDeps = {
  sendNotification: typeof sendNotification;
  getVerifierIdsFromSnapshot: typeof getVerifierIdsFromSnapshot;
};

export const notifyInboxStepTasks = async (
  deps: NotifyDeps,
  suratId: string,
  stepOrder: number,
  judulSurat: string,
  eventType: string,
) => {
  const { data: signatures, error } = await supabase
    .from("surat_signatures")
    .select("id, user_id, verification_required, verification_status, verifier_snapshot")
    .eq("surat_id", suratId)
    .eq("step_order", stepOrder)
    .eq("is_signed", false);

  if (error) {
    console.error("Failed to load inbox notification targets:", error);
    return;
  }

  for (const signature of signatures || []) {
    const verifierIds = signature.verification_required && signature.verification_status !== "verified"
      ? deps.getVerifierIdsFromSnapshot(signature.verifier_snapshot)
      : [];
    const targetIds = verifierIds.length > 0 ? verifierIds : [signature.user_id].filter(Boolean);
    if (targetIds.length === 0) continue;

    const isVerification = verifierIds.length > 0;
    const title = isVerification ? "Pemeriksaan Data Diperlukan" : "Surat Masuk Baru";
    const message = isVerification
      ? `Surat "${judulSurat}" perlu diperiksa sebelum ditandatangani`
      : `Surat "${judulSurat}" memerlukan tindakan Anda`;
    const link = `/surat/inbox?task=${signature.id}`;

    deps.sendNotification(
      targetIds,
      title,
      message,
      link,
      { surat_id: suratId, signature_id: signature.id, event_type: eventType }
    );
  }
};
