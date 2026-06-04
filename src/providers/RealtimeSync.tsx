import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const RealtimeSync = () => {
  const queryClient = useQueryClient();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleSync = (keys: string[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        console.log("Realtime Sync: Refreshing active queries...");
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

    const channel = supabase
      .channel("db-persuratan-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendas" }, () => handleSync(agendaKeys))
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_registrasi" }, () => {
        console.log("Change detected in surat_registrasi");
        handleSync(suratKeys);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "surat_signatures" }, () => {
        console.log("Change detected in surat_signatures");
        handleSync(suratKeys);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, () =>
        handleSync(["recent-logs", "activity-logs"])
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("Tab Fokus: Sinkronisasi data...");
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
        ]);
      }
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
