import { useCallback, useEffect, useState } from "react";
import {
  normalizeNonUnitOption,
  type NonUnitExternalOption,
} from "@/components/surat/non-unit-request";
import type { UsageModuleContext } from "../usage-contract";

export type NonUnitItemOptionsState = {
  options: NonUnitExternalOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Non Unit item options — dimiliki modul Non Unit (bukan orchestrator).
 * Fetch berjalan pra-nomor (setelah proyek Marison siap) maupun pasca-nomor.
 */
export function useNonUnitItemOptions(ctx: UsageModuleContext): NonUnitItemOptionsState {
  const { marisonProject, requestExternalOptions, usage } = ctx;
  const [options, setOptions] = useState<NonUnitExternalOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const projectId = marisonProject?.projectId ?? 0;
  const ready = marisonProject?.ready ?? false;

  useEffect(() => {
    if (!ready || !projectId) {
      setOptions([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    requestExternalOptions("marison_non_units_by_project", {
      project_id: projectId,
    })
      .then((fetched) => {
        if (cancelled) return;
        const normalized = fetched
          .map((option) => normalizeNonUnitOption(option))
          .filter((option): option is NonUnitExternalOption => Boolean(option));
        setOptions(normalized);
        if (normalized.length === 0) {
          setError("Belum ada jenis pekerjaan Non Unit untuk proyek ini.");
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setOptions([]);
        setError(fetchError instanceof Error ? fetchError.message : "Gagal mengambil jenis pekerjaan Non Unit.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ready, projectId, reloadKey, usage.id, requestExternalOptions]);

  const reload = useCallback(() => setReloadKey((current) => current + 1), []);

  return { options, loading, error, reload };
}
