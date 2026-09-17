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

import type {
  WorkTeamOverviewRepository,
  WorkTeamOverviewRouteAdapter,
} from "./work-team-overview";

export const WORK_ENTRY_STATUSES = ["planned", "in_progress", "completed", "blocked"] as const;

/** Status tersimpan. Overdue bukan status tersimpan, melainkan derived state. */
export type WorkEntryStatus = (typeof WORK_ENTRY_STATUSES)[number];

export const WORK_ENTRY_KINDS = ["work", "event", "availability"] as const;

export type WorkEntryKind = (typeof WORK_ENTRY_KINDS)[number];

/**
 * Palet warna statis untuk penanda pekerjaan (CAL-03 F5).
 *
 * Palet sengaja tetap dan kecil supaya:
 * - kontras teks/ikon tetap terjamin pada mode terang dan gelap;
 * - makna tidak bergantung pada warna saja (setiap swatch punya label teks);
 * - nilai yang disimpan di database selalu dapat dipetakan ke tampilan.
 * Nilai ini harus sama dengan constraint `work_calendar_entries_color_swatch_check`.
 */
export const WORK_ENTRY_COLOR_SWATCHES = [
  "slate",
  "blue",
  "teal",
  "amber",
  "rose",
  "violet",
] as const;

export type WorkEntryColorSwatch = (typeof WORK_ENTRY_COLOR_SWATCHES)[number];

/** Jenis peristiwa siklus hidup yang dicatat pada `work_calendar_events`. */
export const WORK_ENTRY_EVENT_TYPES = [
  "created",
  "status_changed",
  "schedule_changed",
  "due_date_changed",
] as const;

export type WorkEntryEventType = (typeof WORK_ENTRY_EVENT_TYPES)[number];

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
  /** Tenggat opsional; `null` berarti tenggat mengikuti `workDate`. */
  dueDate: WorkDate | null;
  /** Penanda warna statis; `null` berarti tanpa penanda. */
  colorSwatch: WorkEntryColorSwatch | null;
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
  dueDate?: WorkDate | null;
  colorSwatch?: WorkEntryColorSwatch | null;
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

/**
 * Satu peristiwa siklus hidup pekerjaan (CAL-03 F5).
 *
 * Peristiwa ditulis oleh trigger database, bukan oleh klien, sehingga
 * riwayat tidak dapat dipalsukan atau dilewati. `detail` memuat hasil
 * pekerjaan (transisi ke `completed`) atau alasan terhambat (transisi ke
 * `blocked`).
 */
export interface WorkEntryEvent {
  id: string;
  entryId: WorkEntryId;
  ownerId: WorkEntryOwnerId;
  type: WorkEntryEventType;
  fromStatus: WorkEntryStatus | null;
  toStatus: WorkEntryStatus | null;
  fromWorkDate: WorkDate | null;
  toWorkDate: WorkDate | null;
  fromDueDate: WorkDate | null;
  toDueDate: WorkDate | null;
  detail: string | null;
  actorId: WorkEntryOwnerId | null;
  createdAt: WorkTimestamp;
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
  /**
   * Resolusi satu entry untuk deep link (CAL-03 F4B), mis.
   * `?view=team&entry=<id>` yang harus tetap terbuka setelah refresh.
   *
   * Read-only: implementasi hanya melakukan SELECT dengan RLS yang sudah ada
   * (tanpa service role dan tanpa migration baru). `null` berarti entry tidak
   * ada, sudah dihapus, id tidak valid, atau di luar cakupan hak pengguna —
   * pemanggil tidak boleh menampilkan data apa pun dalam kasus itu.
   */
  getEntryById(input: { entryId: WorkEntryId; signal?: AbortSignal }): Promise<WorkEntry | null>;
  /**
   * Riwayat peristiwa satu entry, urut dari terlama ke terbaru (CAL-03 F5).
   * Implementasi hanya melakukan SELECT sehingga RLS yang berlaku menentukan
   * cakupan: pekerjaan sendiri atau pekerjaan bawahan yang terotorisasi.
   */
  listEntryEvents(input: {
    entryId: WorkEntryId;
    signal?: AbortSignal;
  }): Promise<readonly WorkEntryEvent[]>;
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
  /**
   * Sumber kebenaran ketersediaan tab Tim. Halaman mengisinya dari probe
   * boolean sehingga bootstrap tidak perlu memuat daftar anggota.
   */
  isTeamViewAvailableOverride?: boolean;
  /**
   * Binding URL React Router untuk mode Tim (filter/halaman masuk history,
   * Back/Forward/deep link memulihkan state). Kosong berarti tanpa URL sync.
   */
  routeAdapter?: WorkTeamOverviewRouteAdapter;
}
