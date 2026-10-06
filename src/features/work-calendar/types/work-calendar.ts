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
  /** Optional explicit deadline; null means no deadline. */
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

/**
 * Konfigurasi hari dan jam kerja (CAL-03 F6).
 *
 * Nilainya diturunkan dari konfigurasi KPI existing (`department_kpi_configs`)
 * untuk departemen pengguna; bila belum dikonfigurasi, default Senin-Jumat
 * 08:00-17:00 dengan istirahat 12:00-13:00 berlaku. Modul ini hanya membaca
 * konfigurasi tersebut, tidak pernah menulisnya.
 */
export interface WorkCalendarWorkSettings {
  /** Hari kerja sebagai ISO weekday: Senin = 1 ... Minggu = 7. */
  workDays: readonly number[];
  /** Jam mulai kerja `HH:mm`. */
  workStart: string;
  /** Jam selesai kerja `HH:mm`. */
  workEnd: string;
  /** Jam mulai istirahat `HH:mm`. */
  breakStart: string;
  /** Jam selesai istirahat `HH:mm`. */
  breakEnd: string;
  /** Zona waktu konfigurasi, mis. `Asia/Jakarta`. */
  timezone: string;
}

/**
 * Satu hari libur pada kalender (CAL-03 F6).
 * `isCutiBersama` membedakan cuti bersama dari libur nasional.
 */
export interface WorkCalendarHoliday {
  date: WorkDate;
  name: string;
  isCutiBersama: boolean;
}

/** Klasifikasi visual satu tanggal. */
export const WORK_CALENDAR_DAY_KINDS = ["work_day", "non_work_day", "holiday"] as const;

export type WorkCalendarDayKind = (typeof WORK_CALENDAR_DAY_KINDS)[number];

/** Hasil klasifikasi satu tanggal untuk pembeda visual Hari/Minggu/Bulan. */
export interface WorkCalendarDayMeta {
  date: WorkDate;
  kind: WorkCalendarDayKind;
  holiday: WorkCalendarHoliday | null;
  isCutiBersama: boolean;
  /** Label yang dapat ditampilkan; `null` untuk hari kerja biasa. */
  label: string | null;
}

/**
 * Sumber data pengaturan hari/jam kerja dan hari libur (CAL-03 F6).
 * Implementasi konkret hanya melakukan SELECT dengan RLS yang sudah ada.
 */
export interface WorkCalendarSettingsRepository {
  getWorkSettings(signal?: AbortSignal): Promise<WorkCalendarWorkSettings>;
  listHolidays(input: {
    fromDate: WorkDate;
    toDate: WorkDate;
    signal?: AbortSignal;
  }): Promise<readonly WorkCalendarHoliday[]>;
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
    /** Projection cutoff in Asia/Jakarta; defaults to the current day. */
    today?: WorkDate;
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
  /**
   * Repository pengaturan hari/jam kerja dan hari libur (CAL-03 F6). Bila
   * diisi, workspace memuat pengaturan dari KPI dan daftar libur untuk rentang
   * yang terlihat. Bila kosong, default Senin-Jumat tanpa libur dipakai.
   */
  settingsRepository?: WorkCalendarSettingsRepository;
  /**
   * Override pengaturan hari/jam kerja (CAL-03 F6) untuk test/harness.
   * Menang atas hasil repository.
   */
  workSettings?: WorkCalendarWorkSettings;
  /**
   * Override daftar hari libur (CAL-03 F6) untuk test/harness.
   * Menang atas hasil repository.
   */
  holidays?: readonly WorkCalendarHoliday[];
}
