import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { attentionService, type AttentionState } from "@/services/attention.service";
import { pushService } from "@/services/push.service";
import { supabase } from "@/lib/supabase";

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
  const refreshTimerRef = useRef<number | null>(null);
  const pushPermissionRequestedRef = useRef(false);
  const [eventVersion, setEventVersion] = useState(0);

  const attentionQuery = useQuery({
    queryKey,
    queryFn: attentionService.getState,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const refetchAttention = attentionQuery.refetch;

  const applyAttentionState = useCallback((nextState: AttentionState) => {
    queryClient.setQueryData(queryKey, nextState);
    setEventVersion((value) => value + 1);
  }, [queryClient]);

  useEffect(() => {
    pushService.ensureSubscription({ requestPermission: false }).catch(() => {});
    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(async () => {
        refreshTimerRef.current = null;
        const result = await refetchAttention();
        if (result.data) applyAttentionState(result.data);
      }, 350);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "marison_sync_issues" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [applyAttentionState, refetchAttention]);

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
