import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { attentionService, type AttentionState } from "@/services/attention.service";
import { pushService } from "@/services/push.service";

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
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const pushPermissionRequestedRef = useRef(false);
  const [eventVersion, setEventVersion] = useState(0);

  const attentionQuery = useQuery({
    queryKey,
    queryFn: attentionService.getState,
    staleTime: 5_000,
    refetchInterval: () => document.visibilityState === "visible" ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  const refetchAttention = attentionQuery.refetch;

  const closeStream = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    sourceRef.current?.close();
    sourceRef.current = null;
    connectingRef.current = false;
  }, []);

  const applyAttentionState = useCallback((nextState: AttentionState) => {
    queryClient.setQueryData(queryKey, nextState);
    setEventVersion((value) => value + 1);
    queryClient.invalidateQueries({ queryKey: ["surat-inbox"] });
    queryClient.invalidateQueries({ queryKey: ["surat-list"] });
    queryClient.invalidateQueries({ queryKey: ["surat-detail"] });
  }, [queryClient]);

  const openStream = useCallback(async () => {
    if (document.visibilityState !== "visible" || sourceRef.current || connectingRef.current) return;
    connectingRef.current = true;
    try {
      const { token } = await attentionService.createStreamToken();
      const source = new EventSource(`/api/attention/stream?token=${encodeURIComponent(token)}`);
      sourceRef.current = source;

      source.addEventListener("attention_changed", (event) => {
        const data = JSON.parse((event as MessageEvent).data || "{}") as AttentionState;
        applyAttentionState(data);
      });

      source.addEventListener("attention_error", () => {
        refetchAttention();
      });

      source.onerror = () => {
        closeStream();
        if (document.visibilityState === "visible") {
          reconnectTimerRef.current = window.setTimeout(() => {
            openStream();
          }, 3000);
        }
      };
    } catch (error) {
      console.error("Attention stream failed:", error);
      closeStream();
      if (document.visibilityState === "visible") {
        reconnectTimerRef.current = window.setTimeout(() => {
          openStream();
        }, 5000);
      }
    } finally {
      connectingRef.current = false;
    }
  }, [applyAttentionState, closeStream, refetchAttention]);

  useEffect(() => {
    openStream();
    pushService.ensureSubscription({ requestPermission: false }).catch(() => {});

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeStream();
        return;
      }
      refetchAttention();
      openStream();
    };

    const handlePageHide = () => closeStream();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      closeStream();
    };
  }, [closeStream, openStream, refetchAttention]);

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
