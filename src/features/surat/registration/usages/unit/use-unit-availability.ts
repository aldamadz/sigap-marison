import { useEffect, useState } from "react";
import type { UsageModuleContext } from "../usage-contract";
import type { ProjectRaw } from "@/components/surat/form/surat-form-types";
import { EMPTY_UNIT_AVAILABILITY, type UnitAvailabilityState } from "./unit-availability";

/**
 * Hanya field yang dipakai lookup. Orchestrator membangun objek ini sebelum
 * moduleCtx lengkap agar hasilnya bisa masuk ke moduleCtx itu sendiri.
 */
export type UnitAvailabilityContext = Pick<
  UsageModuleContext,
  "usage" | "category" | "input" | "requestExternalOptions"
>;

/**
 * Lookup `marison_units_by_project` dimiliki orchestrator agar panel konteks,
 * gate nomor, dan gate submit membaca satu nilai yang sama.
 *
 * Fetch ulang saat proyek berarti state lama tidak pernah dipakai untuk
 * proyek baru. Berjalan pra-nomor dan pasca-nomor (revisi eksternal
 * mengaktifkan kembali jumlah unit).
 */
export function useUnitAvailability(ctx: UnitAvailabilityContext | null): UnitAvailabilityState {
  const [availability, setAvailability] = useState<UnitAvailabilityState>(EMPTY_UNIT_AVAILABILITY);

  const requestedProject = ctx?.input.requested_project as ProjectRaw | undefined;
  const projectId = String(requestedProject?.id || "").trim();
  const projectCode = String(requestedProject?.code || "").trim();
  const requestExternalOptions = ctx?.requestExternalOptions;
  const usageId = ctx?.usage.id ?? "";
  const isUnit = ctx?.category === "unit";

  useEffect(() => {
    if (!isUnit || !projectId || !projectCode || !requestExternalOptions) {
      setAvailability(EMPTY_UNIT_AVAILABILITY);
      return;
    }
    let cancelled = false;
    setAvailability({ loading: true, count: null, error: null });
    requestExternalOptions("marison_units_by_project", {
      project_id: projectId,
      requested_project: requestedProject,
    })
      .then((options) => {
        if (cancelled) return;
        setAvailability({ loading: false, count: options.length, error: null });
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setAvailability({
          loading: false,
          count: null,
          error: fetchError instanceof Error ? fetchError.message : "Gagal mengambil unit tersedia.",
        });
      });
    return () => { cancelled = true; };
    // projectCode + projectId: ganti proyek = state kapasitas lama dibuang.
  }, [isUnit, projectId, projectCode, usageId, requestExternalOptions]);

  return availability;
}
