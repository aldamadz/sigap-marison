/**
 * Binding URL route Work Calendar (CAL-03 F4A Director Scale).
 *
 * Tujuan:
 * - satu mekanisme navigasi (React Router), bukan `window.history` langsung;
 * - perubahan filter/halaman Tim masuk history sehingga Back/Forward
 *   memulihkan state;
 * - tanggal acuan kalender (`date`) dan tanggal mode Tim selalu sama;
 * - query parameter lain milik route tidak pernah dihapus.
 *
 * Adapter sengaja hanya mengekspos baca/tulis + `key` (string URL terkini).
 * Konsumen mendeteksi navigasi luar (Back/Forward/deep link) dengan memantau
 * perubahan `key`, lalu membandingkan nilainya; tulis-ulang state yang identik
 * tidak menghasilkan loop.
 */

import { useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import type { WorkCalendarViewMode, WorkDate } from "../types/work-calendar";
import type {
  WorkTeamOverviewRouteAdapter,
  WorkTeamOverviewRouteWriteOptions,
  WorkTeamOverviewUrlState,
} from "../types/work-team-overview";
import { WORK_CALENDAR_VIEW_MODES } from "../types/work-calendar";
import {
  applyWorkTeamOverviewUrlState,
  readWorkTeamOverviewUrlState,
} from "../lib/work-team-overview";

const ANCHOR_DATE_KEY = "date";
const VIEW_KEY = "view";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type { WorkTeamOverviewRouteAdapter, WorkTeamOverviewRouteWriteOptions };

export interface WorkCalendarRouteBinding {
  /** Tanggal acuan dari query `date`, bila valid. */
  initialAnchorDate: WorkDate | null;
  /** Tampilan dari query `view`, bila valid. */
  initialView: WorkCalendarViewMode | null;
  adapter: WorkTeamOverviewRouteAdapter;
}

function isViewMode(value: string | null): value is WorkCalendarViewMode {
  return (
    typeof value === "string" &&
    (WORK_CALENDAR_VIEW_MODES as readonly string[]).includes(value)
  );
}

export function useWorkCalendarRouteBinding(): WorkCalendarRouteBinding {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const search = searchParams.toString();
  const key = `${location.pathname}?${search}`;

  // Dibaca sekali saat mount; navigasi setelahnya dibaca ulang lewat adapter.
  const initialRef = useRef<{
    anchorDate: WorkDate | null;
    view: WorkCalendarViewMode | null;
  } | null>(null);
  if (initialRef.current === null) {
    const rawDate = searchParams.get(ANCHOR_DATE_KEY);
    const rawView = searchParams.get(VIEW_KEY);
    initialRef.current = {
      anchorDate: rawDate && ISO_DATE_PATTERN.test(rawDate) ? rawDate : null,
      view: isViewMode(rawView) ? rawView : null,
    };
  }

  // Ref supaya identitas adapter stabil dan penulisan selalu memakai URL terkini.
  const searchRef = useRef(search);
  searchRef.current = search;
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  /**
   * Penulisan berantai dalam satu tick (mis. tanggal + filter) diakumulasikan
   * supaya tulisan kedua tidak menimpa parameter tulisan pertama.
   */
  const pendingRef = useRef<URLSearchParams | null>(null);

  const commit = useCallback(
    (mutate: (params: URLSearchParams) => URLSearchParams | void, replace: boolean): void => {
      const base = pendingRef.current ?? new URLSearchParams(searchRef.current);
      const draft = new URLSearchParams(base.toString());
      // `mutate` boleh mengubah `draft` di tempat atau mengembalikan objek baru
      // (mis. `applyWorkTeamOverviewUrlState` menyalin params).
      const replaced: URLSearchParams | void = mutate(draft);
      const next: URLSearchParams = replaced ? replaced : draft;
      const nextSearch = next.toString();
      // Tidak ada perubahan: jangan sentuh history sama sekali.
      if (nextSearch === searchRef.current) return;
      pendingRef.current = next;
      const target = nextSearch.length > 0 ? `?${nextSearch}` : pathnameRef.current;
      navigate(target, { replace });
    },
    [navigate],
  );

  const adapter = useMemo<WorkTeamOverviewRouteAdapter>(
    () => ({
      key,
      read(fallbackDate) {
        return readWorkTeamOverviewUrlState({ search: searchRef.current, fallbackDate });
      },
      readView() {
        const raw = new URLSearchParams(searchRef.current).get(VIEW_KEY);
        return isViewMode(raw) ? raw : null;
      },
      readAnchorDate() {
        const raw = new URLSearchParams(searchRef.current).get(ANCHOR_DATE_KEY);
        return raw && ISO_DATE_PATTERN.test(raw) ? raw : null;
      },
      write(state, options) {
        commit(
          (params) => applyWorkTeamOverviewUrlState(params, state),
          options?.replace ?? false,
        );
      },
      writeAnchorDate(date, options) {
        if (!ISO_DATE_PATTERN.test(date)) return;
        commit((params) => {
          if (params.get(ANCHOR_DATE_KEY) === date) return;
          params.set(ANCHOR_DATE_KEY, date);
        }, options?.replace ?? false);
      },
      writeView(view, options) {
        commit((params) => {
          if (params.get(VIEW_KEY) === view) return;
          params.set(VIEW_KEY, view);
        }, options?.replace ?? false);
      },
    }),
    [commit, key],
  );

  // Setelah render berikutnya, URL sudah memuat tulisan terakhir.
  if (pendingRef.current !== null && pendingRef.current.toString() === search) {
    pendingRef.current = null;
  }

  return {
    initialAnchorDate: initialRef.current.anchorDate,
    initialView: initialRef.current.view,
    adapter,
  };
}
