import { useCallback, useEffect, useRef } from "react";
import { onRealtimeReconnect, supabase } from "@/lib/supabase";

/** Local-state master pages need reloads, not invalidation of unused query keys. */
export function useMasterRealtimeReload(
  name: string,
  tables: readonly string[],
  load: (background: boolean) => Promise<void>,
) {
  const loadRef = useRef(load);
  const reloadRef = useRef<(background?: boolean) => Promise<void>>(async () => {});
  useEffect(() => { loadRef.current = load; });
  const tableKey = tables.join(",");

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let flight: Promise<void> | null = null;
    let dirty = false;
    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const reload = (background = true): Promise<void> => {
      clearTimer();
      if (disposed) return Promise.resolve();
      if (flight) { dirty = true; return flight; }
      dirty = false;
      flight = Promise.resolve().then(() => {
        if (!disposed) return loadRef.current(background);
      }).finally(() => {
        flight = null;
        if (dirty && !disposed) schedule();
      });
      return flight;
    };
    const schedule = () => {
      if (disposed) return;
      dirty = true;
      // A fixed window is bounded even during sustained bursts. Never overlap loads.
      if (timer === null && !flight) timer = setTimeout(() => { void reload(); }, 150);
    };
    reloadRef.current = reload;
    const channel = supabase.channel(name);
    for (const table of tableKey.split(",")) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    const reconnect = onRealtimeReconnect(schedule);
    void reload(false);
    return () => {
      disposed = true;
      clearTimer();
      reconnect.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [name, tableKey]);

  return useCallback(() => reloadRef.current(), []);
}
