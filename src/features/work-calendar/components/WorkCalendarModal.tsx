/**
 * Primitive modal Work Calendar (CAL-03 F4B).
 *
 * Perilaku modal — focus trap, latar `aria-hidden`, kunci scroll body, Escape
 * dari seluruh kontrol, klik overlay, dan pemulihan fokus — seluruhnya
 * didelegasikan ke Radix Dialog. Komponen ini hanya menambahkan presentasi:
 * Framer Motion menggerakkan overlay + panel, dan `AnimatePresence` di
 * workspace memegang exit animation.
 *
 * Catatan penting:
 * - `forceMount` dipakai pada Portal/Overlay/Content supaya Radix tidak
 *   melepas DOM lebih dulu daripada exit animation Framer Motion. Siklus
 *   mount/unmount tetap dikendalikan `AnimatePresence` pemanggil.
 * - `asChild` + `motion.div` dipakai supaya animasi Framer tetap menjadi satu
 *   lapisan dengan elemen Radix (tidak ada overlay atau panel ganda).
 * - Radix tidak menetapkan `aria-modal`; atribut itu ditetapkan di sini.
 * - Portal bawaan Radix adalah pengganti portal manual: permukaan `fixed`
 *   tidak lagi menjadi anak `.sigap-page` yang memakai `space-y-5`.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import {
  getWorkCalendarMotionDurations,
  WORK_CALENDAR_EASE,
} from "../lib/work-calendar-motion";

/** Pola presentasi panel; menentukan arah gerak masuk/keluar. */
export type WorkCalendarModalVariant = "side-sheet" | "bottom-sheet" | "centered";

export interface WorkCalendarModalProps {
  /** Dipanggil saat Radix meminta modal ditutup (Escape/klik overlay). */
  onRequestClose: () => void;
  /** Id elemen judul di dalam panel (`aria-labelledby`). */
  labelledBy?: string;
  /** Id elemen deskripsi di dalam panel (`aria-describedby`). */
  describedBy?: string;
  /** Elemen yang menerima fokus saat modal dibuka. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  variant: WorkCalendarModalVariant;
  panelTestId: string;
  overlayTestId: string;
  panelClassName: string;
  overlayClassName?: string;
  /**
   * `true` bila Escape tidak boleh menutup modal saat ini (mis. sedang
   * mengedit sub-bagian di dalam panel). Primitive tetap menjadi pemilik
   * keputusan: hanya target dismiss yang dapat ditahan.
   */
  holdEscape?: boolean;
  children?: ReactNode;
}

/**
 * Modal Work Calendar. Selalu dirender dalam keadaan "terbuka"; memutuskan
 * kapan memasang/melepas komponen ini adalah tanggung jawab `AnimatePresence`
 * pemanggil, sehingga exit animation tidak bertabrakan dengan Radix Presence.
 */
export function WorkCalendarModal({
  onRequestClose,
  labelledBy,
  describedBy,
  initialFocusRef,
  variant,
  panelTestId,
  overlayTestId,
  panelClassName,
  overlayClassName,
  holdEscape = false,
  children,
}: WorkCalendarModalProps) {
  const prefersReducedMotion = useReducedMotion() === true;
  const durations = getWorkCalendarMotionDurations(prefersReducedMotion);

  /**
   * Elemen yang fokusnya harus dipulihkan setelah modal ditutup. Diambil saat
   * mount (sebelum Radix memindahkan fokus), bukan saat menutup, karena pada
   * saat itu fokus sudah berada di dalam panel.
   */
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const holdEscapeRef = useRef(holdEscape);
  holdEscapeRef.current = holdEscape;

  const offsetX = variant === "side-sheet" && !prefersReducedMotion ? 48 : 0;
  const offsetY = variant === "bottom-sheet" && !prefersReducedMotion ? 24 : 0;

  return (
    <DialogPrimitive.Root
      open
      modal
      onOpenChange={(next) => {
        if (!next) onRequestClose();
      }}
    >
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40"
          data-testid={`${overlayTestId}-backdrop`}
        >
          <motion.div
            data-testid={overlayTestId}
            aria-hidden="true"
            onClick={onRequestClose}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: durations.overlay, ease: WORK_CALENDAR_EASE },
            }}
            exit={{
              opacity: 0,
              transition: { duration: durations.overlay, ease: WORK_CALENDAR_EASE },
            }}
            className={overlayClassName ?? "fixed inset-0 bg-black/55"}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          forceMount
          asChild
          aria-modal={true}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          onEscapeKeyDown={(event) => {
            if (holdEscapeRef.current) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            // Fokus awal ditentukan pemanggil (mis. heading detail atau input
            // judul); jangan biarkan Radix memfokuskan kontrol pertama.
            event.preventDefault();
            initialFocusRef?.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // Radix akan memfokuskan `triggerRef` yang kosong karena kita
            // tidak memakai `DialogTrigger`; kembalikan ke pemicu sebenarnya.
            event.preventDefault();
            const previous = previouslyFocusedRef.current;
            if (previous && previous.isConnected) previous.focus();
          }}
        >
          <motion.div
            data-testid={panelTestId}
            initial={{ opacity: 0, x: offsetX, y: offsetY }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              transition: { duration: durations.sheet, ease: WORK_CALENDAR_EASE },
            }}
            exit={{
              opacity: 0,
              x: offsetX,
              y: offsetY,
              transition: { duration: durations.sheet, ease: WORK_CALENDAR_EASE },
            }}
            className={panelClassName}
          >
            {children}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
