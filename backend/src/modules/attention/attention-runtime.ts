type SupabaseResult<T> = { data: T | null; error: Error | null };

type AttentionResultRow = {
  approval_count?: string | number;
  verification_count?: string | number;
  revision_count?: string | number;
  follow_up_count?: string | number;
  recommendation_count?: string | number;
  unread_notifications?: string | number;
  monitoring_count?: string | number;
  master_office_review_count?: string | number;
  profile_review_count?: string | number;
  master_project_review_count?: string | number;
};

export interface AttentionSupabaseClient {
  rpc(name: "get_attention_state_for_user", params: unknown): Promise<SupabaseResult<AttentionResultRow[] | AttentionResultRow>>;
  rpc(name: "get_compact_inbox_count", params: unknown): Promise<SupabaseResult<string | number>>;
  rpc(name: "get_user_active_sla_breach_count", params: unknown): Promise<SupabaseResult<string | number>>;
}

export type AttentionDependencies = {
  getSupabase: () => AttentionSupabaseClient | null;
  requireSupabaseUser: (token: string | undefined) => Promise<{ id: string }>;
  now?: () => Date;
};

const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const createAttentionRuntime = ({ getSupabase, requireSupabaseUser, now = () => new Date() }: AttentionDependencies) => {
  const getAttentionStateForUser = async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase server credentials are not configured.");
    if (!userId) throw statusError("Unauthorized", 401);

    const [attentionRes, compactCountRes, overdueSlaRes] = await Promise.all([
      supabase.rpc("get_attention_state_for_user", { p_user_id: userId }),
      supabase.rpc("get_compact_inbox_count", { p_user_id: userId }),
      supabase.rpc("get_user_active_sla_breach_count", { p_user_id: userId }),
    ]);

    if (attentionRes.error) throw attentionRes.error;
    if (compactCountRes.error) throw compactCountRes.error;
    if (overdueSlaRes.error) throw overdueSlaRes.error;

    const row = Array.isArray(attentionRes.data) ? attentionRes.data[0] : attentionRes.data;

    return {
      approvalCount: Number(row?.approval_count || 0),
      verificationCount: Number(row?.verification_count || 0),
      revisionCount: Number(row?.revision_count || 0),
      recommendationCount: Number(row?.recommendation_count || 0),
      inboxCount: Number(compactCountRes.data || 0),
      unreadNotifications: Number(row?.unread_notifications || 0),
      monitoringCount: Number(row?.monitoring_count || 0),
      followUpCount: Number(row?.follow_up_count || 0),
      masterOfficeReviewCount: Number(row?.master_office_review_count || 0),
      profileReviewCount: Number(row?.profile_review_count || 0),
      masterProjectReviewCount: Number(row?.master_project_review_count || 0),
      overdueSlaCount: Number(overdueSlaRes.data || 0),
      generatedAt: now().toISOString(),
    };
  };

  const getAttentionStateFromRequest = async (token: string | undefined) => getAttentionStateForUser((await requireSupabaseUser(token)).id);

  return { getAttentionStateForUser, getAttentionStateFromRequest };
};
