/**
 * Batas preview tampilan Minggu yang responsif.
 *
 * Hook ini sengaja lokal di fitur Work Calendar (tanpa impor hook aplikasi)
 * supaya batas modul CAL-03 tetap terjaga. Satu nilai dipakai untuk memilih
 * limit sekaligus supaya layout mobile dan desktop tidak perlu merender dua
 * daftar berbeda (tidak ada DOM aksesibel ganda).
 *
 * Nilai murni `getWorkWeekPreviewLimit` tetap dapat diuji tanpa DOM.
 */

import { useEffect, useState } from "react";

import { getWorkWeekPreviewLimit } from "../lib/work-progress";

/** Selaras dengan breakpoint Tailwind `md` (768px). */
const WEEK_MOBILE_QUERY = "(max-width: 767px)";

function readIsMobileWeek(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(WEEK_MOBILE_QUERY).matches;
}

export function useWorkWeekPreviewLimit(): number {
  const [isMobile, setIsMobile] = useState<boolean>(readIsMobileWeek);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(WEEK_MOBILE_QUERY);
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return getWorkWeekPreviewLimit(isMobile);
}
