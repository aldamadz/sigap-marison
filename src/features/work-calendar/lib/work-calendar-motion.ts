/**
 * Durasi motion Work Calendar (CAL-03 F4B).
 *
 * Angka ini adalah kontrak produk, bukan preferensi: overlay 150-180 ms,
 * sheet 220-260 ms, crossfade detail/editor ringan. `prefers-reduced-motion`
 * hanya memakai opacity dan durasi minimal, sehingga tidak ada perpindahan
 * besar yang mengganggu orientasi.
 *
 * Modul ini murni supaya kontraknya dapat diuji tanpa merender komponen.
 */

/** Overlay fade: 160 ms (rentang wajib 150-180 ms). */
export const WORK_CALENDAR_OVERLAY_DURATION_SECONDS = 0.16;

/** Sheet slide: 240 ms (rentang wajib 220-260 ms). */
export const WORK_CALENDAR_SHEET_DURATION_SECONDS = 0.24;

/** Crossfade detail <-> editor: ringan, di bawah 200 ms. */
export const WORK_CALENDAR_CROSSFADE_DURATION_SECONDS = 0.12;

/** Durasi untuk pengguna dengan `prefers-reduced-motion: reduce`. */
export const WORK_CALENDAR_REDUCED_DURATION_SECONDS = 0.08;

/** Lebar sheet detail pada desktop/tablet (px). */
export const WORK_CALENDAR_DETAIL_SHEET_MIN_WIDTH = 480;
export const WORK_CALENDAR_DETAIL_SHEET_MAX_WIDTH = 560;

/** Kurva easing tunggal supaya seluruh animasi terasa satu keluarga. */
export const WORK_CALENDAR_EASE: readonly [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface WorkCalendarMotionDurations {
  overlay: number;
  sheet: number;
  crossfade: number;
}

/**
 * Durasi efektif. Saat reduced motion, perpindahan dinonaktifkan (offset 0)
 * dan durasi dipangkas ke nilai minimal; pemanggil tetap memakai opacity.
 */
export function getWorkCalendarMotionDurations(
  prefersReducedMotion: boolean,
): WorkCalendarMotionDurations {
  if (prefersReducedMotion) {
    return {
      overlay: WORK_CALENDAR_REDUCED_DURATION_SECONDS,
      sheet: WORK_CALENDAR_REDUCED_DURATION_SECONDS,
      crossfade: WORK_CALENDAR_REDUCED_DURATION_SECONDS,
    };
  }
  return {
    overlay: WORK_CALENDAR_OVERLAY_DURATION_SECONDS,
    sheet: WORK_CALENDAR_SHEET_DURATION_SECONDS,
    crossfade: WORK_CALENDAR_CROSSFADE_DURATION_SECONDS,
  };
}
