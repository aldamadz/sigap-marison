/**
 * Deteksi viewport sempit Work Calendar (CAL-03 F4B).
 *
 * Satu nilai dipakai untuk memilih pola interaksi (sheet layar penuh vs side
 * sheet, bottom sheet vs popover) supaya tidak pernah ada dua DOM aksesibel
 * yang melakukan hal sama.
 *
 * Selaras dengan breakpoint Tailwind `md` (768px), sama seperti batas preview
 * Minggu dan filter Team Overview.
 */

import { useEffect, useState } from "react";

export const WORK_CALENDAR_COMPACT_QUERY = "(max-width: 767px)";

function readIsCompact(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(WORK_CALENDAR_COMPACT_QUERY).matches;
}

export function useWorkCalendarCompact(): boolean {
  const [isCompact, setIsCompact] = useState<boolean>(readIsCompact);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(WORK_CALENDAR_COMPACT_QUERY);
    const onChange = () => setIsCompact(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return isCompact;
}
