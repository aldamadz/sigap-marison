import { supabase } from "@/lib/supabase";

export type AttentionState = {
  approvalCount: number;
  verificationCount: number;
  recommendationCount: number;
  inboxCount: number;
  unreadNotifications: number;
  monitoringCount: number;
  followUpCount: number;
  masterOfficeReviewCount: number;
  profileReviewCount: number;
  masterProjectReviewCount: number;
  overdueSlaCount: number;
  generatedAt?: string;
};

type RawAttentionState = Partial<AttentionState> & {
  approval_count?: unknown;
  verification_count?: unknown;
  recommendation_count?: unknown;
  inbox_count?: unknown;
  unread_notifications?: unknown;
  monitoring_count?: unknown;
  follow_up_count?: unknown;
  master_office_review_count?: unknown;
  profile_review_count?: unknown;
  master_project_review_count?: unknown;
  overdue_sla_count?: unknown;
  generated_at?: unknown;
};

const emptyState: AttentionState = {
  approvalCount: 0,
  verificationCount: 0,
  recommendationCount: 0,
  inboxCount: 0,
  unreadNotifications: 0,
  monitoringCount: 0,
  followUpCount: 0,
  masterOfficeReviewCount: 0,
  profileReviewCount: 0,
  masterProjectReviewCount: 0,
  overdueSlaCount: 0,
};

const toCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export const normalizeAttentionState = (raw: RawAttentionState | null | undefined): AttentionState => {
  const source = raw || {};
  return {
    approvalCount: toCount(source.approvalCount ?? source.approval_count),
    verificationCount: toCount(source.verificationCount ?? source.verification_count),
    recommendationCount: toCount(source.recommendationCount ?? source.recommendation_count),
    inboxCount: toCount(source.inboxCount ?? source.inbox_count),
    unreadNotifications: toCount(source.unreadNotifications ?? source.unread_notifications),
    monitoringCount: toCount(source.monitoringCount ?? source.monitoring_count),
    followUpCount: toCount(source.followUpCount ?? source.follow_up_count),
    masterOfficeReviewCount: toCount(source.masterOfficeReviewCount ?? source.master_office_review_count),
    profileReviewCount: toCount(source.profileReviewCount ?? source.profile_review_count),
    masterProjectReviewCount: toCount(source.masterProjectReviewCount ?? source.master_project_review_count),
    overdueSlaCount: toCount(source.overdueSlaCount ?? source.overdue_sla_count),
    generatedAt: String(source.generatedAt ?? source.generated_at ?? "").trim() || undefined,
  };
};

const getAccessToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Tidak terautentikasi");
  return session.access_token;
};

const authHeaders = async () => ({
  Authorization: `Bearer ${await getAccessToken()}`,
});

const safeRequestId = (value: unknown) => typeof value === "string" && value.length >= 8 && value.length <= 80
  && !/[^A-Za-z0-9_-]/.test(value)
  ? value : undefined;

export class AttentionRequestError extends Error {
  readonly httpStatus?: number;
  readonly requestId?: string;

  constructor(status: number, requestId?: unknown) {
    super("Request gagal diproses.");
    this.name = "HttpError";
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.httpStatus = status;
    this.requestId = safeRequestId(requestId);
  }
}

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AttentionRequestError(response.status,
      safeRequestId(response.headers.get("X-Request-Id")) ?? safeRequestId(payload?.requestId));
  }
  return payload as T;
};

export const attentionService = {
  emptyState,

  async getState(): Promise<AttentionState> {
    const response = await fetch("/api/attention/state", {
      headers: await authHeaders(),
    });
    return normalizeAttentionState(await readJsonResponse<RawAttentionState>(response));
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
