import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { attentionService, type AttentionState } from "@/services/attention.service";
import { pushService } from "@/services/push.service";
import { supabase, onRealtimeReconnect } from "@/lib/supabase";
import { createRealtimeFlush, type FlushController } from "@/lib/realtime-flush";

type AttentionContextValue = {
  state: AttentionState;
  loading: boolean;
  eventVersion: number;
  refetch: () => Promise<unknown>;
  requestPushPermission: () => Promise<unknown>;
};

const AttentionContext = createContext<AttentionContextValue>({
  state: attentionService.emptyState,
  loading: false,
  eventVersion: 0,
  refetch: async () => undefined,
  requestPushPermission: async () => undefined,
});

const queryKey = ["attention-state"];

export const AttentionProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const flushRef = useRef<FlushController | null>(null);
  const pushPermissionRequestedRef = useRef(false);
  const [eventVersion, setEventVersion] = useState(0);

  const attentionQuery = useQuery({
    queryKey,
    queryFn: attentionService.getState,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const refetchAttention = attentionQuery.refetch;

  // A refetch changes query data; bump eventVersion so notification surfaces
  // that key off it (Header) reload even when the object identity is preserved.
  useEffect(() => {
    if (attentionQuery.data) setEventVersion((value) => value + 1);
  }, [attentionQuery.data]);

  useEffect(() => {
    pushService.ensureSubscription({ requestPermission: false }).catch(() => {});

    const flush = createRealtimeFlush({
      queryClient,
      debounceMs: 200,
      maxFlushDelayMs: 800,
    });
    flushRef.current = flush;

    const scheduleRefresh = () => {
      // Fast but batched: union of triggers fires one bounded refetch.
      flush.add("attention-state", "notifications");
    };

    const channel = supabase
      .channel("attention-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_revision_events" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_recommendation_tasks" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "master_offices" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "master_projects" }, scheduleRefresh)
      // NOTE: `profiles` is intentionally NOT subscribed here. Its RLS SELECT
      // policy allows every authenticated user to read all active profiles,
      // and postgres_changes delivers full rows (nik, email, phone). See
      // REALTIME_ALLOWED_TABLES in backend/src/modules/bff/bff-runtime.ts.
      .on("postgres_changes", { event: "*", schema: "public", table: "marison_sync_issues" }, scheduleRefresh)
      .subscribe();

    // Missed events during an offline gap change attention state; revalidate.
    const reconnectSubscription = onRealtimeReconnect(() => scheduleRefresh());

    return () => {
      reconnectSubscription.unsubscribe();
      flush.cancel();
      supabase.removeChannel(channel);
    };
  }, [refetchAttention, queryClient]);

  const value = useMemo<AttentionContextValue>(() => ({
    state: attentionQuery.data || attentionService.emptyState,
    loading: attentionQuery.isLoading,
    eventVersion,
    refetch: refetchAttention,
    requestPushPermission: () => {
      if (pushPermissionRequestedRef.current) return Promise.resolve({ enabled: false, reason: "already_requested" });
      pushPermissionRequestedRef.current = true;
      return pushService.ensureSubscription({ requestPermission: true });
    },
  }), [attentionQuery.data, attentionQuery.isLoading, eventVersion, refetchAttention]);

  return (
    <AttentionContext.Provider value={value}>
      {children}
    </AttentionContext.Provider>
  );
};

export const useAttention = () => useContext(AttentionContext);
