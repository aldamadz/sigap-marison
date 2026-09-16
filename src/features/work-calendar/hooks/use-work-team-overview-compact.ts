/**
 * Deteksi viewport sempit untuk Team Overview (CAL-03 F4A).
 *
 * Satu nilai dipakai untuk memilih apakah filter dirender inline (desktop/
 * tablet) atau di dalam Sheet (mobile), sehingga tidak pernah ada DOM ganda
 * yang membingungkan pembaca layar.
 *
 * Selaras dengan breakpoint Tailwind `md` (768px), sama seperti
 * `useWorkWeekPreviewLimit`.
 */

import { useEffect, useState } from "react";

const COMPACT_QUERY = "(max-width: 767px)";

function readIsCompact(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COMPACT_QUERY).matches;
}

export function useWorkTeamOverviewCompact(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(readIsCompact);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setIsCompact(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return isCompact;
}
