/**
 * Primitif motion Work Calendar (CAL-03 F4B).
 *
 * Batasan yang disengaja:
 * - hanya `AnimatePresence`/`motion` dari Framer Motion, tanpa animasi layout
 *   besar (`layout`, `layoutId`) dan tanpa animasi dekoratif;
 * - `useReducedMotion` menonaktifkan perpindahan; yang tersisa hanya opacity
 *   dengan durasi minimal;
 * - durasi overlay/panel/crossfade berasal dari `lib/work-calendar-motion`
 *   supaya kontraknya dapat diuji murni;
 * - overlay dan panel modal TIDAK dirender di sini. Permukaan itu memakai
 *   `WorkCalendarModal` (Radix Dialog) sehingga focus trap, kunci scroll body,
 *   `aria-hidden` latar, Escape, dan pemulihan fokus menjadi tanggung jawab
 *   primitive, bukan implementasi buatan sendiri.
 */

import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { forwardRef, type ReactNode } from "react";

import {
  getWorkCalendarMotionDurations,
  WORK_CALENDAR_EASE,
  type WorkCalendarMotionDurations,
} from "../lib/work-calendar-motion";

export interface WorkCalendarMotion {
  reducedMotion: boolean;
  durations: WorkCalendarMotionDurations;
}

/** Durasi efektif + preferensi reduced motion pengguna. */
export function useWorkCalendarMotion(): WorkCalendarMotion {
  const prefersReducedMotion = useReducedMotion() === true;
  return {
    reducedMotion: prefersReducedMotion,
    durations: getWorkCalendarMotionDurations(prefersReducedMotion),
  };
}

export interface WorkCalendarCrossfadeProps {
  duration: number;
  /** Kunci berubah saat isi berganti (mis. detail -> editor). */
  contentKey: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Crossfade ringan untuk pergantian detail <-> editor di dalam sheet yang
 * sama. Sengaja hanya opacity + offset minimal supaya tidak ada dua modal.
 */
export const WorkCalendarCrossfade = forwardRef<HTMLDivElement, WorkCalendarCrossfadeProps>(
  function WorkCalendarCrossfade({ duration, contentKey, className, children }, ref) {
    const animation: MotionProps = {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration, ease: WORK_CALENDAR_EASE } },
      exit: { opacity: 0, transition: { duration, ease: WORK_CALENDAR_EASE } },
    };

    return (
      <motion.div key={contentKey} {...animation} ref={ref} className={className}>
        {children}
      </motion.div>
    );
  },
);

export { AnimatePresence } from "framer-motion";
