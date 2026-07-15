import { supabase } from "@/lib/supabase";

export type AttentionState = {
  approvalCount: number;
  verificationCount: number;
  recommendationCount: number;
  inboxCount: number;
  unreadNotifications: number;
  monitoringCount: number;
  followUpCount: number;
  generatedAt?: string;
};

const emptyState: AttentionState = {
  approvalCount: 0,
  verificationCount: 0,
  recommendationCount: 0,
  inboxCount: 0,
  unreadNotifications: 0,
  monitoringCount: 0,
  followUpCount: 0,
};

const getAccessToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Tidak terautentikasi");
  return session.access_token;
};

const authHeaders = async () => ({
  Authorization: `Bearer ${await getAccessToken()}`,
});

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Request gagal diproses.");
  }
  return payload as T;
};

export const attentionService = {
  emptyState,

  async getState(): Promise<AttentionState> {
    const response = await fetch("/api/attention/state", {
      headers: await authHeaders(),
    });
    return readJsonResponse<AttentionState>(response);
  },

  async getPushPublicKey(): Promise<{ enabled: boolean; publicKey: string | null }> {
    const response = await fetch("/api/push/public-key", {
      headers: await authHeaders(),
    });
    return readJsonResponse(response);
  },

  async savePushSubscription(subscription: PushSubscription) {
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify({ subscription }),
    });
    return readJsonResponse<{ ok: boolean }>(response);
  },
};
