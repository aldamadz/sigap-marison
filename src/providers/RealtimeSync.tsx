import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, onRealtimeReconnect } from "@/lib/supabase";
import { createRealtimeFlush, type FlushController } from "@/lib/realtime-flush";

const agendaKeys = ["agendas", "kpi", "status-dist", "dept-activity", "recent-logs", "activity-logs"];
const suratKeys = [
  "recent-logs", "activity-logs", "surat-list", "surat-inbox", "surat-detail",
  "surat-stats-dashboard", "surat-monitoring-list", "admin-monitoring-list",
  "surat-riwayat-keterlibatan", "surat-revision-history", "surat-linked-documents",
];
const userKeys = ["users", "activity-logs", "recent-logs"];
const focusKeys = [
  "agendas", "kpi", "status-dist", "dept-activity", "recent-logs", "activity-logs",
  "surat-list", "surat-inbox", "surat-detail", "users",
];

export const RealtimeSync = () => {
  const queryClient = useQueryClient();
  const flushRef = useRef<FlushController | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const lastFocusSyncRef = useRef(0);

  useEffect(() => {
    const flush = createRealtimeFlush({ queryClient });
    flushRef.current = flush;

    const handleSync = (keys: string[]) => flush.add(...keys);

    const channel = supabase
      .channel("db-persuratan-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendas" }, () => handleSync(agendaKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_attachments" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () =>
        handleSync(["recent-logs", "activity-logs"])
      )
      // NOTE: `profiles` is intentionally NOT subscribed. Full profile rows
      // (nik, email, phone) must not be broadcast to every authenticated
      // user; the user directory still refreshes on focus/reconnect via
      // userKeys below.
      .subscribe();

    // Events received while the client was offline are not replayed by Supabase
    // Realtime, so revalidate every surface after the stream reconnects.
    const reconnectSubscription = onRealtimeReconnect(() => {
      flush.add(...agendaKeys, ...suratKeys, ...userKeys);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const hiddenDuration = hiddenAtRef.current ? now - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenDuration < 2_000 || now - lastFocusSyncRef.current < 15_000) return;

      lastFocusSyncRef.current = now;
      handleSync(focusKeys);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reconnectSubscription.unsubscribe();
      supabase.removeChannel(channel);
      flush.cancel();
      flushRef.current = null;
    };
  }, [queryClient]);

  return null;
};
