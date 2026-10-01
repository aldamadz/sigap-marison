import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { createRealtimeFlush } from "@/lib/realtime-flush";

export const RealtimeSync = () => {
  const queryClient = useQueryClient();
  const hiddenAtRef = useRef<number | null>(null);
  const lastFocusSyncRef = useRef(0);

  useEffect(() => {
    const flush = createRealtimeFlush({ queryClient });
    const handleSync = (keys: string[]) => flush.add(...keys);

    const agendaKeys = ["agendas", "kpi", "status-dist", "dept-activity", "recent-logs", "activity-logs"];
    const suratKeys = [
      "recent-logs", "activity-logs", "surat-list", "surat-inbox", "surat-detail",
      "surat-stats-dashboard", "surat-monitoring-list", "admin-monitoring-list",
      "surat-riwayat-keterlibatan", "surat-revision-history", "surat-linked-documents",
      "recommendation-tasks", "surat-follow-up-requester",
    ];

    const channel = supabase
      .channel("db-persuratan-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendas" }, () => handleSync(agendaKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_attachments" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_linked_documents" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_recommendation_tasks" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_revision_events" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () =>
        handleSync(["recent-logs", "activity-logs"])
      )
      .subscribe();

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
      handleSync([
        "agendas",
        "kpi",
        "status-dist",
        "dept-activity",
        "recent-logs",
        "activity-logs",
        "surat-list",
        "surat-inbox",
        "surat-detail",
        "recommendation-tasks",
        "surat-follow-up-requester",
        "surat-linked-documents",
        "surat-monitoring-list",
        "admin-monitoring-list",
        "users",
      ]);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      flush.cancel();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
};
