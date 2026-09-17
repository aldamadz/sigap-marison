/**
 * Focus trap ringan untuk panel Work Calendar (CAL-03 F4B).
 *
 * Perilaku:
 * - fokus awal dipindahkan ke elemen yang diberikan (biasanya heading detail);
 * - Tab/Shift+Tab berputar di dalam panel saja;
 * - fokus dikembalikan ke elemen pemicu saat panel ditutup, bila elemen itu
 *   masih ada di dokumen.
 *
 * Implementasi sengaja tanpa dependensi supaya aturan fokus dapat dibaca dan
 * diuji langsung, dan tidak menambah paket baru ke fitur ini.
 */

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function listFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  );
}

export interface UseWorkCalendarFocusTrapInput {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Elemen yang menerima fokus pertama; jatuh ke elemen fokusable pertama. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useWorkCalendarFocusTrap({
  active,
  containerRef,
  initialFocusRef,
}: UseWorkCalendarFocusTrapInput): void {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitial = () => {
      const target = initialFocusRef?.current ?? listFocusableElements(container)[0] ?? container;
      target.focus();
    };
    // Satu frame supaya konten sudah terpasang saat fokus dipindahkan.
    const frame = window.requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = listFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (current === last || !container.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
