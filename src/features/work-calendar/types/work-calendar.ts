/**
 * Fresh CAL-03 domain contract untuk Unified Work Calendar.
 *
 * Modul ini sengaja berdiri sendiri dan tidak mengimpor:
 * - tipe `src/types/agenda.ts`;
 * - service, adapter, schema, atau komponen agenda lama;
 * - Supabase, React, atau React Query.
 *
 * Semua tanggal kerja (`workDate`) adalah tanggal kalender Asia/Jakarta
 * dalam format `YYYY-MM-DD`. `startsAt`/`endsAt`/`createdAt`/`updatedAt`
 * adalah timestamp ISO-8601.
 */

import type { WorkTeamOverviewRepository } from "./work-team-overview";

export const WORK_ENTRY_STATUSES = ["planned", "in_progress", "completed", "blocked"] as const;

/** Status tersimpan. Overdue bukan status tersimpan, melainkan derived state. */
export type WorkEntryStatus = (typeof WORK_ENTRY_STATUSES)[number];

export const WORK_ENTRY_KINDS = ["work", "event", "availability"] as const;

export type WorkEntryKind = (typeof WORK_ENTRY_KINDS)[number];

export const WORK_CALENDAR_VIEW_MODES = ["day", "week", "month", "team"] as const;

export type WorkCalendarViewMode = (typeof WORK_CALENDAR_VIEW_MODES)[number];

export type WorkEntryId = string;
export type WorkEntryOwnerId = string;

/** Tanggal kerja kalender Asia/Jakarta, `YYYY-MM-DD`. */
export type WorkDate = string;

/** Timestamp ISO-8601. */
export type WorkTimestamp = string;

export interface WorkEntry {
  id: WorkEntryId;
  ownerId: WorkEntryOwnerId;
  workDate: WorkDate;
  title: string;
  realization: string | null;
  notes: string | null;
  location: string | null;
  status: WorkEntryStatus;
  kind: WorkEntryKind;
  isAllDay: boolean;
  startsAt: WorkTimestamp | null;
  endsAt: WorkTimestamp | null;
  blockedReason: string | null;
  completedAt: WorkTimestamp | null;
  deletedAt: WorkTimestamp | null;
  createdAt: WorkTimestamp;
  updatedAt: WorkTimestamp;
}

/** Input pembuatan entry. `ownerId` dan `workDate` wajib eksplisit. */
export interface WorkEntryDraft {
  ownerId: WorkEntryOwnerId;
  workDate: WorkDate;
  title: string;
  status: WorkEntryStatus;
  kind: WorkEntryKind;
  isAllDay: boolean;
  realization?: string | null;
  notes?: string | null;
  location?: string | null;
  startsAt?: WorkTimestamp | null;
  endsAt?: WorkTimestamp | null;
  blockedReason?: string | null;
}

/** Patch pembaruan entry. `ownerId` tidak dapat diubah dari UI. */
export type WorkEntryPatch = Partial<Omit<WorkEntryDraft, "ownerId">>;

/** Satu entry dengan status turunan overdue untuk tanggal acuan tertentu. */
export interface WorkEntryState {
  entry: WorkEntry;
  isOverdue: boolean;
}

export interface WorkEntryOwner {
  id: WorkEntryOwnerId;
  name: string;
  jobTitle: string | null;
}

/** Kelompok entry per pemilik; dipakai mode Tim dan filter pemilik. */
export interface WorkEntryOwnerGroup {
  owner: WorkEntryOwner;
  entries: readonly WorkEntry[];
  isCurrentUser: boolean;
  isTeamMember: boolean;
}

export interface WorkProgressCounts {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
  blocked: number;
  overdue: number;
}

export interface WorkCalendarDaySummary {
  date: WorkDate;
  entries: readonly WorkEntry[];
  progress: WorkProgressCounts;
}

export interface WorkCalendarDayCell extends WorkCalendarDaySummary {
  isCurrentMonth: boolean;
  isToday: boolean;
}

/** View-model yang dihitung murni dari entry, bukan dari jam dinding. */
export interface WorkCalendarViewModel {
  view: WorkCalendarViewMode;
  anchorDate: WorkDate;
  today: WorkDate;
  ownerFilterId: WorkEntryOwnerId | "all";
  datesInScope: readonly WorkDate[];
}

/**
 * Batas izin UI. Implementasi konkret mengikuti RLS produksi
 * (own-write, subordinate-read-only), tetapi F1 hanya memakai kontrak ini.
 */
export interface WorkCalendarPermissions {
  canEditEntry: (entry: WorkEntry) => boolean;
  canDeleteEntry: (entry: WorkEntry) => boolean;
}

/**
 * Sumber data yang disuntikkan dari luar. F1 tidak memanggil Supabase;
 * implementasi konkret dibuat pada fase integrasi berikutnya.
 */
export interface WorkEntryRepository {
  listEntries(input: {
    ownerId: WorkEntryOwnerId;
    fromDate: WorkDate;
    toDate: WorkDate;
    signal?: AbortSignal;
  }): Promise<readonly WorkEntry[]>;
  listTeamEntries(input: {
    fromDate: WorkDate;
    toDate: WorkDate;
    signal?: AbortSignal;
  }): Promise<readonly WorkEntry[]>;
  createEntry(input: WorkEntryDraft): Promise<WorkEntry>;
  updateEntry(input: { entryId: WorkEntryId; patch: WorkEntryPatch; expectedUpdatedAt: WorkTimestamp }): Promise<WorkEntry>;
  deleteEntry(input: { entryId: WorkEntryId; expectedUpdatedAt: WorkTimestamp }): Promise<void>;
}

export interface WorkCalendarWorkspaceProps {
  currentUser: WorkEntryOwner;
  repository: WorkEntryRepository;
  teamMembers?: readonly WorkEntryOwner[];
  permissions?: WorkCalendarPermissions;
  initialView?: WorkCalendarViewMode;
  initialAnchorDate?: WorkDate;
  /** Sumber waktu yang dapat diganti pada test agar tidak memakai jam dinding. */
  now?: () => Date;
  /**
   * Repository Team Overview server-side (CAL-03 F4A Director Scale). Bila
   * diisi, mode Tim memakai paginasi server dan tidak pernah memuat seluruh
   * pekerjaan organisasi sekaligus.
   */
  teamOverviewRepository?: WorkTeamOverviewRepository;
  /** Sinkronkan filter Tim ke URL query (dipakai halaman, mati pada test). */
  syncTeamFiltersToUrl?: boolean;
}
