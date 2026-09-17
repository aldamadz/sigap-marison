/**
 * Primitif motion Work Calendar (CAL-03 F4B).
 *
 * Batasan yang disengaja:
 * - hanya `AnimatePresence`/`motion` dari Framer Motion, tanpa animasi layout
 *   besar (`layout`, `layoutId`) dan tanpa animasi dekoratif;
 * - `useReducedMotion` menonaktifkan perpindahan; yang tersisa hanya opacity
 *   dengan durasi minimal;
 * - overlay dan panel memakai durasi dari `lib/work-calendar-motion` supaya
 *   kontraknya dapat diuji murni.
 */

import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  getWorkCalendarMotionDurations,
  WORK_CALENDAR_EASE,
  type WorkCalendarMotionDurations,
} from "../lib/work-calendar-motion";

/**
 * Permukaan `fixed` (overlay/panel) dirender lewat portal ke `document.body`.
 *
 * Alasannya konkret: workspace memakai pembungkus `.sigap-page` yang memiliki
 * `space-y-5`. Aturan itu menambahkan `margin-top: 20px` pada setiap anak
 * sesudah anak pertama, sehingga sheet yang `top-0 h-full` bergeser 20px ke
 * bawah (terpotong) dan overlay `inset-0` menyisakan celah 20px di atas yang
 * tidak bisa diklik untuk menutup. Portal juga membuat permukaan ini kebal
 * terhadap `transform`/`contain` leluhur yang dapat mengubah containing block
 * `position: fixed`.
 *
 * React context (termasuk `PresenceContext` Framer Motion) tetap mengalir
 * melewati portal, jadi exit animation `AnimatePresence` tetap berjalan.
 */
function renderFixedSurface(node: ReactNode): ReactNode {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

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

export interface WorkCalendarOverlayProps {
  /** Durasi fade overlay (detik). */
  duration: number;
  onDismiss: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * Overlay gelap yang menutup panel saat diklik. Overlay tidak pernah dipakai
 * dua kali (tidak ada modal bertumpuk) karena tiap panel dirender tepat satu.
 */
export function WorkCalendarOverlay({
  duration,
  onDismiss,
  className,
  ...rest
}: WorkCalendarOverlayProps) {
  const animation: MotionProps = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration, ease: WORK_CALENDAR_EASE } },
    exit: { opacity: 0, transition: { duration, ease: WORK_CALENDAR_EASE } },
  };

  return renderFixedSurface(
    <motion.div
      {...animation}
      data-work-calendar-overlay
      onClick={onDismiss}
      aria-hidden="true"
      className={className ?? "fixed inset-0 z-40 bg-black/55"}
      {...rest}
    />,
  );
}

export interface WorkCalendarSlidePanelProps {
  /**
   * Offset awal/akhir. Saat reduced motion nilai ini adalah 0 sehingga panel
   * hanya berubah opacity.
   */
  offsetX: number;
  offsetY: number;
  duration: number;
  className?: string;
  children?: ReactNode;
  role?: string;
  "aria-modal"?: boolean;
  "aria-labelledby"?: string;
  "data-testid"?: string;
}

/**
 * Panel yang bergeser dari sisi/bawah layar dengan fade ringan.
 *
 * `forwardRef` diperlukan `AnimatePresence`: saat anak dihapus, motion harus
 * tetap dapat menyelesaikan exit animation sebelum node dilepas.
 */
export const WorkCalendarSlidePanel = forwardRef<HTMLDivElement, WorkCalendarSlidePanelProps>(
  function WorkCalendarSlidePanel(
    { offsetX, offsetY, duration, className, children, ...rest },
    ref,
  ) {
    const animation: MotionProps = {
      initial: { opacity: 0, x: offsetX, y: offsetY },
      animate: {
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration, ease: WORK_CALENDAR_EASE },
      },
      exit: {
        opacity: 0,
        x: offsetX,
        y: offsetY,
        transition: { duration, ease: WORK_CALENDAR_EASE },
      },
    };

    return renderFixedSurface(
      <motion.div {...animation} ref={ref} className={className} {...rest}>
        {children}
      </motion.div>,
    );
  },
);

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
