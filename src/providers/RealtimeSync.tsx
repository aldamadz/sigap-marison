import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const RealtimeSync = () => {
  const queryClient = useQueryClient();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const lastFocusSyncRef = useRef(0);

  useEffect(() => {
    const handleSync = (keys: string[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        const allowedKeys = new Set(keys);

        await queryClient.refetchQueries({
          predicate: (query) =>
            allowedKeys.has(query.queryKey[0] as string),
          type: "active",
        });
      }, 1000);
    };

    const agendaKeys = ["agendas", "kpi", "status-dist", "dept-activity", "recent-logs", "activity-logs"];
    const suratKeys = ["recent-logs", "activity-logs", "surat-list", "surat-inbox", "surat-detail"];
    const userKeys = ["users", "activity-logs", "recent-logs"];

    const channel = supabase
      .channel("db-persuratan-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendas" }, () => handleSync(agendaKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_attachments" }, () => handleSync(suratKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () =>
        handleSync(["recent-logs", "activity-logs"])
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () =>
        handleSync(userKeys)
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
        "users",
      ]);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
};
