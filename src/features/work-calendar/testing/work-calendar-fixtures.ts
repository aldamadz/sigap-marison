/**
 * Fixture Unified Work Calendar.
 *
 * HANYA untuk test dan visual verification. Modul ini tidak boleh diimpor
 * oleh barrel `index.ts` maupun oleh runtime aplikasi production.
 */

import type {
  WorkCalendarHoliday,
  WorkCalendarSettingsRepository,
  WorkCalendarWorkSettings,
  WorkEntry,
  WorkEntryDraft,
  WorkEntryEvent,
  WorkEntryOwner,
  WorkEntryOwnerId,
  WorkEntryRepository,
  WorkDate,
  WorkProgressCounts,
} from "../types/work-calendar";
import type {
  WorkTeamOverviewMember,
  WorkTeamOverviewOption,
  WorkTeamOverviewRepository,
} from "../types/work-team-overview";
import { shiftWorkDate } from "../lib/work-calendar-date";
import { isWorkEntryVisibleInRange, selectWorkEntriesForDate } from "../lib/work-entry-carryover";
import { isWorkEntryOverdue } from "../lib/work-entry-status";
import { WorkEntryConflictError } from "../lib/work-entry-conflict";
import { buildWorkEntryEventDrafts } from "../lib/work-entry-lifecycle";
import { computeWorkProgress } from "../lib/work-progress";

export const WORK_CALENDAR_FIXTURE_TODAY: WorkDate = "2026-03-10";

/** Id dimensi organisasi untuk fixture Team Overview. */
export const WORK_CALENDAR_FIXTURE_OFFICE_A_ID = "office-a";
export const WORK_CALENDAR_FIXTURE_OFFICE_B_ID = "office-b";
export const WORK_CALENDAR_FIXTURE_DEPARTMENT_FINANCE_ID = "dept-finance";
export const WORK_CALENDAR_FIXTURE_DEPARTMENT_OPS_ID = "dept-ops";

const OFFICE_A_ID = WORK_CALENDAR_FIXTURE_OFFICE_A_ID;
const OFFICE_B_ID = WORK_CALENDAR_FIXTURE_OFFICE_B_ID;
const DEPT_FINANCE_ID = WORK_CALENDAR_FIXTURE_DEPARTMENT_FINANCE_ID;
const DEPT_OPS_ID = WORK_CALENDAR_FIXTURE_DEPARTMENT_OPS_ID;

/** Waktu tetap agar fixture tidak bergantung jam dinding. */
export function workCalendarFixtureNow(): Date {
  // 2026-03-10T08:30:00+07:00
  return new Date("2026-03-10T01:30:00.000Z");
}

export const WORK_CALENDAR_FIXTURE_CURRENT_USER: WorkEntryOwner = {
  id: "user-current",
  name: "Rangga Prasetyo",
  jobTitle: "Koordinator Operasional",
};

export const WORK_CALENDAR_FIXTURE_TEAM_MEMBERS: readonly WorkEntryOwner[] = [
  { id: "user-bawahan-1", name: "Sinta Maharani", jobTitle: "Staf Operasional" },
  { id: "user-bawahan-2", name: "Bimo Nugroho", jobTitle: "Staf Administrasi" },
  { id: "user-bawahan-3", name: "Dewi Lestari", jobTitle: "Staf Keuangan" },
];

let fixtureCounter = 0;

export function createFixtureWorkEntry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  fixtureCounter += 1;
  const workDate = overrides.workDate ?? WORK_CALENDAR_FIXTURE_TODAY;
  return {
    id: overrides.id ?? `entry-${fixtureCounter}`,
    ownerId: overrides.ownerId ?? WORK_CALENDAR_FIXTURE_CURRENT_USER.id,
    workDate,
    title: overrides.title ?? `Entry contoh ${fixtureCounter}`,
    realization: overrides.realization ?? null,
    notes: overrides.notes ?? null,
    location: overrides.location ?? null,
    status: overrides.status ?? "planned",
    kind: overrides.kind ?? "work",
    isAllDay: overrides.isAllDay ?? true,
    startsAt: overrides.startsAt ?? null,
    endsAt: overrides.endsAt ?? null,
    blockedReason: overrides.blockedReason ?? null,
    completedAt: overrides.completedAt ?? null,
    dueDate: overrides.dueDate ?? null,
    colorSwatch: overrides.colorSwatch ?? null,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-03-10T01:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-10T01:00:00.000Z",
  };
}

export function createFixtureWorkEntries(): WorkEntry[] {
  const today = WORK_CALENDAR_FIXTURE_TODAY;
  const entries: WorkEntry[] = [
    createFixtureWorkEntry({
      id: "own-1",
      title: "Rekap laporan operasional harian",
      status: "completed",
      realization: "Rekap dikirim ke atasan pukul 09.10.",
      completedAt: "2026-03-10T02:10:00.000Z",
    }),
    createFixtureWorkEntry({
      id: "own-2",
      title: "Tindak lanjut temuan audit internal",
      status: "in_progress",
      isAllDay: false,
      startsAt: "2026-03-10T02:00:00.000Z",
      endsAt: "2026-03-10T04:00:00.000Z",
      location: "Ruang rapat lantai 2",
    }),
    createFixtureWorkEntry({
      id: "own-3",
      title: "Sinkronisasi data proyek dengan Marison",
      status: "blocked",
      blockedReason: "Menunggu konfirmasi kode proyek dari pusat.",
    }),
    createFixtureWorkEntry({
      id: "own-4",
      title: "Update dokumen SOP penerimaan berkas",
      status: "planned",
    }),
    createFixtureWorkEntry({
      id: "own-overdue",
      title: "Kirim berita acara serah terima",
      status: "planned",
      workDate: shiftWorkDate(today, -4),
      dueDate: shiftWorkDate(today, -4),
    }),
    createFixtureWorkEntry({
      id: "own-week-1",
      title: "Kunjungan lapangan proyek Cikarang",
      status: "planned",
      workDate: shiftWorkDate(today, 2),
    }),
    createFixtureWorkEntry({
      id: "own-week-2",
      title: "Penyusunan rencana kerja minggu depan",
      status: "planned",
      workDate: shiftWorkDate(today, 4),
    }),
    createFixtureWorkEntry({
      id: "team-1",
      ownerId: "user-bawahan-1",
      title: "Input berkas pengajuan unit baru",
      status: "completed",
      realization: "12 berkas selesai diinput.",
      completedAt: "2026-03-10T03:00:00.000Z",
    }),
    createFixtureWorkEntry({
      id: "team-2",
      ownerId: "user-bawahan-1",
      title: "Verifikasi kelengkapan dokumen",
      status: "in_progress",
    }),
    createFixtureWorkEntry({
      id: "team-3",
      ownerId: "user-bawahan-2",
      title: "Penataan arsip fisik berkas 2025",
      status: "blocked",
      blockedReason: "Ruang arsip sedang dipakai kegiatan lain.",
    }),
    createFixtureWorkEntry({
      id: "team-4",
      ownerId: "user-bawahan-2",
      title: "Rekap absensi bulanan",
      status: "planned",
    }),
    createFixtureWorkEntry({
      id: "team-5",
      ownerId: "user-bawahan-3",
      title: "Penyusunan RAB perjalanan dinas",
      status: "completed",
      realization: "RAB disetujui dan diserahkan ke keuangan.",
      completedAt: "2026-03-10T04:30:00.000Z",
    }),
    createFixtureWorkEntry({
      id: "team-overdue",
      ownerId: "user-bawahan-3",
      title: "Setor bukti kas kecil",
      status: "planned",
      workDate: shiftWorkDate(today, -2),
      dueDate: shiftWorkDate(today, -2),
    }),
  ];

  // Sebar entry ke beberapa tanggal pada bulan berjalan agar tampilan bulan terisi.
  const monthSpread = [
    { day: -2, index: 0, title: "Rapat koordinasi bulanan", status: "completed" as const },
    { day: -2, index: 1, title: "Pembaruan data master kantor", status: "in_progress" as const },
    { day: -1, index: 0, title: "Penyelesaian laporan mingguan", status: "completed" as const },
    { day: 1, index: 0, title: "Peninjauan berkas proyek baru", status: "planned" as const },
    { day: 3, index: 0, title: "Audit internal tahap 1", status: "planned" as const },
    { day: 3, index: 1, title: "Wawancara calon mitra", status: "planned" as const },
    { day: 3, index: 2, title: "Pengecekan inventaris gudang", status: "planned" as const },
  ];
  for (const spread of monthSpread) {
    entries.push(
      createFixtureWorkEntry({
        id: `spread-${spread.day}-${spread.index}`,
        title: spread.title,
        status: spread.status,
        workDate: shiftWorkDate(today, spread.day),
      }),
    );
  }

  return entries;
}

/**
 * Repository in-memory untuk test dan visual verification.
 * Tidak melakukan jaringan dan tidak menulis ke database.
 */
export function createFixtureWorkEntryRepository(
  seed: readonly WorkEntry[] = createFixtureWorkEntries(),
  options: {
    failOnList?: boolean;
    /** Reference clock for deterministic completion and event timestamps. */
    now?: () => Date;
    /**
     * Meniru RLS: bila diisi, `getEntryById` hanya mengembalikan entry milik
     * pemilik yang terotorisasi. `undefined` berarti semua owner diizinkan.
     */
    authorizedOwnerIds?: readonly string[];
    /** Menunda respons `getEntryById` agar test dapat mengamati race/batal. */
    getEntryByIdDelayMs?: number;
    /** Mengisi `true` saat `getEntryById` selesai (sukses maupun gagal). */
    entryByIdResolvedRef?: { current: boolean };
  } = {},
): WorkEntryRepository {
  const store = new Map<string, WorkEntry>(seed.map((entry) => [entry.id, entry]));
  const readNow = options.now ?? workCalendarFixtureNow;
  let counter = seed.length;

  /**
   * Riwayat peristiwa in-memory yang meniru trigger database
   * `work_calendar_entries_log_event` (CAL-03 F5): dibuat saat entry dibuat,
   * lalu satu peristiwa per perubahan status/tanggal/tenggat. Tidak ada
   * peristiwa untuk update yang tidak mengubah ketiganya.
   */
  const eventStore = new Map<string, WorkEntryEvent[]>();
  let eventCounter = 0;
  const nextEventId = (): string => {
    eventCounter += 1;
    return `event-${eventCounter}`;
  };  const appendEvents = (
    ownerId: string,
    entryId: string,
    drafts: ReturnType<typeof buildWorkEntryEventDrafts>,
  ): void => {
    if (drafts.length === 0) return;
    const history = eventStore.get(entryId) ?? [];
    const now = readNow().toISOString();
    for (const draft of drafts) {
      history.push({
        id: nextEventId(),
        entryId,
        ownerId,
        type: draft.type,
        fromStatus: draft.fromStatus,
        toStatus: draft.toStatus,
        fromWorkDate: draft.fromWorkDate,
        toWorkDate: draft.toWorkDate,
        fromDueDate: draft.fromDueDate,
        toDueDate: draft.toDueDate,
        detail: draft.detail,
        actorId: ownerId,
        createdAt: now,
      });
    }
    eventStore.set(entryId, history);
  };

  const authorizedOwnerIds = options.authorizedOwnerIds;
  const isOwnerAuthorized = (ownerId: string): boolean =>
    authorizedOwnerIds === undefined || authorizedOwnerIds.includes(ownerId);

  // Seed dianggap dibuat lewat jalur normal, jadi setiap entry punya tepat satu
  // peristiwa `created`, sama seperti hasil trigger database.
  for (const entry of store.values()) {
    appendEvents(entry.ownerId, entry.id, buildWorkEntryEventDrafts(null, entry));
  }

  const listInRange = (fromDate: WorkDate, toDate: WorkDate, today = WORK_CALENDAR_FIXTURE_TODAY): WorkEntry[] =>
    [...store.values()]
      .filter((entry) => isOwnerAuthorized(entry.ownerId) && isWorkEntryVisibleInRange(entry, fromDate, toDate, today))
      .sort((left, right) => (left.workDate < right.workDate ? -1 : left.workDate > right.workDate ? 1 : 0));

  return {
    async listEntries({ ownerId, fromDate, toDate, today }) {
      if (options.failOnList) throw new Error("Gagal memuat data pekerjaan (fixture).");
      return listInRange(fromDate, toDate, today).filter((entry) => entry.ownerId === ownerId);
    },
    async listTeamEntries({ fromDate, toDate }) {
      if (options.failOnList) throw new Error("Gagal memuat data pekerjaan (fixture).");
      return listInRange(fromDate, toDate);
    },
    async getEntryById({ entryId, signal }) {
      try {
        if (options.getEntryByIdDelayMs) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, options.getEntryByIdDelayMs);
          });
        }
        if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
        const entry = store.get(entryId);
        if (!entry || entry.deletedAt !== null) return null;
        if (!isOwnerAuthorized(entry.ownerId)) return null;
        return entry;
      } finally {
        if (options.entryByIdResolvedRef) options.entryByIdResolvedRef.current = true;
      }
    },
    async createEntry(draft: WorkEntryDraft) {
      counter += 1;
      const now = readNow().toISOString();
      const entry: WorkEntry = {
        id: `created-${counter}`,
        ownerId: draft.ownerId,
        workDate: draft.workDate,
        title: draft.title,
        realization: draft.realization ?? null,
        notes: draft.notes ?? null,
        location: draft.location ?? null,
        status: draft.status,
        kind: draft.kind,
        isAllDay: draft.isAllDay,
        startsAt: draft.startsAt ?? null,
        endsAt: draft.endsAt ?? null,
        blockedReason: draft.blockedReason ?? null,
        completedAt: draft.status === "completed" ? now : null,
        dueDate: draft.dueDate ?? null,
        colorSwatch: draft.colorSwatch ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.set(entry.id, entry);
      appendEvents(entry.ownerId, entry.id, buildWorkEntryEventDrafts(null, entry));
      return entry;
    },
    async listEntryEvents({ entryId }) {
      return [...(eventStore.get(entryId) ?? [])];
    },
    async updateEntry({ entryId, patch, expectedUpdatedAt }) {
      const current = store.get(entryId);
      if (!current) throw new Error("Entry tidak ditemukan.");
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new WorkEntryConflictError("Data telah berubah");
      }
      const now = new Date(Math.max(readNow().getTime(), new Date(current.updatedAt).getTime() + 1)).toISOString();
      const next: WorkEntry = { ...current, ...patch, updatedAt: now };
      if (next.status === "completed") {
        next.completedAt = current.status === "completed" ? current.completedAt : now;
      } else {
        next.completedAt = null;
      }
      if (next.status !== "blocked") next.blockedReason = null;
      store.set(entryId, next);
      appendEvents(next.ownerId, entryId, buildWorkEntryEventDrafts(current, next));
      return next;
    },
    async deleteEntry({ entryId, expectedUpdatedAt }) {
      const current = store.get(entryId);
      if (!current) return;
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new WorkEntryConflictError("Data telah berubah");
      }
      store.set(entryId, { ...current, deletedAt: readNow().toISOString() });
    },
  };
}

/**
 * Repository in-memory Team Overview untuk test dan visual verification
 * (CAL-03 F4A). Meniru kontrak server-side: paginasi, agregat seluruh hasil
 * filter, opsi terotorisasi, dan pemuatan pekerjaan anggota per tanggal.
 *
 * Fixture ini sengaja tidak menambahkan anggota di luar `seed`, sehingga
 * perilaku "filter hanya mempersempit" dapat diuji.
 */
export function createFixtureWorkTeamOverviewRepository(
  seed: readonly WorkEntry[] = createFixtureWorkEntries(),
  options: {
    members?: readonly WorkTeamOverviewOption[];
    failOnOverview?: boolean;
    failOnOptions?: boolean;
    failOnMemberEntries?: boolean;
    today?: WorkDate;
    /** Memberi jeda agar test dapat mengamati pembatalan permintaan lama. */
    delayMs?: number;
    signalRef?: { current: AbortSignal | null };
  } = {},
): WorkTeamOverviewRepository {
  const today = options.today ?? WORK_CALENDAR_FIXTURE_TODAY;
  const providedOptions = options.members;
  const defaultMemberOptions: readonly WorkTeamOverviewOption[] =
    WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.map<WorkTeamOverviewOption>((member, index) => ({
      kind: "member",
      id: member.id,
      label: member.name,
      sublabel: member.jobTitle,
      officeId: index % 2 === 0 ? OFFICE_A_ID : OFFICE_B_ID,
      departmentId: index % 2 === 0 ? DEPT_FINANCE_ID : DEPT_OPS_ID,
      memberCount: 0,
    }));

  const sourceOptions: readonly WorkTeamOverviewOption[] =
    providedOptions ?? defaultMemberOptions;
  const memberOptions = sourceOptions.filter((option) => option.kind === "member");

  const officeOptions: readonly WorkTeamOverviewOption[] =
    providedOptions !== undefined
      ? providedOptions.filter((option) => option.kind === "office")
      : [
          {
            kind: "office",
            id: OFFICE_A_ID,
            label: "Kantor Pusat",
            sublabel: null,
            officeId: OFFICE_A_ID,
            departmentId: null,
            memberCount: memberOptions.filter((option) => option.officeId === OFFICE_A_ID)
              .length,
          },
          {
            kind: "office",
            id: OFFICE_B_ID,
            label: "Kantor Bandung",
            sublabel: null,
            officeId: OFFICE_B_ID,
            departmentId: null,
            memberCount: memberOptions.filter((option) => option.officeId === OFFICE_B_ID)
              .length,
          },
        ];

  const departmentOptions: readonly WorkTeamOverviewOption[] =
    providedOptions !== undefined
      ? providedOptions.filter((option) => option.kind === "department")
      : (() => {
          // Meniru RPC: satu baris departemen per pasangan (departemen, kantor)
          // dengan `member_count` yang dipersempit ke kantor tersebut, supaya
          // cascading Kantor -> Departemen konsisten dengan server.
          const pairs = new Map<string, WorkTeamOverviewOption>();
          for (const member of memberOptions) {
            if (member.departmentId === null || member.officeId === null) continue;
            const key = `${member.departmentId}::${member.officeId}`;
            const label =
              member.departmentId === DEPT_FINANCE_ID
                ? "Keuangan"
                : member.departmentId === DEPT_OPS_ID
                  ? "Operasional"
                  : member.departmentId;
            const existing = pairs.get(key);
            pairs.set(key, {
              kind: "department",
              id: member.departmentId,
              label,
              sublabel: null,
              officeId: member.officeId,
              departmentId: member.departmentId,
              memberCount: (existing?.memberCount ?? 0) + 1,
            });
          }
          return [...pairs.values()];
        })();

  const delay = async (signal: AbortSignal | undefined): Promise<void> => {
    if (options.signalRef) options.signalRef.current = signal ?? null;
    if (!options.delayMs) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, options.delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("Dibatalkan.");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  const entriesFor = (memberId: string, date: WorkDate): WorkEntry[] =>
    selectWorkEntriesForDate(seed.filter((entry) => entry.ownerId === memberId), date, today);

  return {
    async hasAuthorizedTeamMembers(signal) {
      await delay(signal);
      if (options.failOnOptions) return false;
      return memberOptions.length > 0;
    },

    async listAuthorizedOrganizationOptions(signal) {
      await delay(signal);
      if (options.failOnOptions) throw new Error("Gagal memuat pilihan organisasi (fixture).");
      return [...officeOptions, ...departmentOptions];
    },

    async searchTeamMembers({ search, officeId, departmentId, offset, limit, signal }) {
      await delay(signal);
      if (options.failOnOptions) throw new Error("Gagal mencari anggota tim (fixture).");
      const limitValue = limit ?? 25;
      const term = search.trim().toLowerCase();
      const matched = memberOptions.filter((option) => {
        if (officeId && option.officeId !== officeId) return false;
        if (departmentId && option.departmentId !== departmentId) return false;
        if (term.length > 0) {
          const haystack = `${option.label} ${option.sublabel ?? ""}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      });
      const start = Math.max(offset, 0);
      return {
        members: matched.slice(start, start + limitValue),
        totalCount: matched.length,
        offset: start,
        limit: limitValue,
      };
    },

    async getAuthorizedTeamMember(memberId, signal) {
      await delay(signal);
      return memberOptions.find((option) => option.id === memberId) ?? null;
    },

    async listTeamOverview({ filters, page, pageSize, signal }) {
      await delay(signal);
      if (options.failOnOverview) throw new Error("Gagal memuat ringkasan tim (fixture).");

      const search = filters.search.trim().toLowerCase();
      const candidates = memberOptions.filter((option) => {
        if (filters.officeId && option.officeId !== filters.officeId) return false;
        if (filters.departmentId && option.departmentId !== filters.departmentId) return false;
        if (filters.memberId && option.id !== filters.memberId) return false;
        if (search.length > 0) {
          const haystack = `${option.label} ${option.sublabel ?? ""}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      });

      const withProgress = candidates.map((option) => ({
        option,
        entries: entriesFor(option.id, filters.workDate).filter((entry) =>
          filters.status === "all" || (filters.status === "overdue" ? isWorkEntryOverdue(entry, today) : entry.status === filters.status),
        ),
      }));

      const statusFiltered = withProgress.filter(({ entries }) => {
        if (filters.status === "all") return true;
        return entries.length > 0;
      });

      const aggregate = statusFiltered.reduce<WorkProgressCounts>(
        (accumulator, { entries }) => {
          const progress = computeWorkProgress(entries, today);
          return {
            total: accumulator.total + progress.total,
            planned: accumulator.planned + progress.planned,
            inProgress: accumulator.inProgress + progress.inProgress,
            completed: accumulator.completed + progress.completed,
            blocked: accumulator.blocked + progress.blocked,
            overdue: accumulator.overdue + progress.overdue,
          };
        },
        { total: 0, planned: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 },
      );

      const totalCount = statusFiltered.length;
      // Meniru clamp server: offset di luar rentang dipetakan ke halaman
      // terakhir, dan halaman yang dilaporkan ikut di-clamp.
      const lastPageOffset =
        totalCount === 0 ? 0 : Math.floor((totalCount - 1) / pageSize) * pageSize;
      const offset = Math.min(Math.max((page - 1) * pageSize, 0), lastPageOffset);
      const members = statusFiltered.slice(offset, offset + pageSize).map<WorkTeamOverviewMember>(
        ({ option, entries }) => ({
          owner: { id: option.id, name: option.label, jobTitle: option.sublabel },
          officeId: option.officeId,
          officeName: officeOptions.find((office) => office.id === option.officeId)?.label ?? null,
          departmentId: option.departmentId,
          departmentName:
            departmentOptions.find((department) => department.id === option.departmentId)?.label ??
            null,
          progress: computeWorkProgress(entries, today),
        }),
      );

      return {
        members,
        totalCount,
        aggregate,
        page: Math.min(Math.max(page, 1), Math.max(Math.ceil(totalCount / pageSize), 1)),
        pageSize,
      };
    },

    async listTeamMemberEntries({ memberId, date, signal }) {
      await delay(signal);
      if (options.failOnMemberEntries) {
        throw new Error("Gagal memuat pekerjaan anggota (fixture).");
      }
      return entriesFor(memberId, date);
    },
  };
}

/**
 * Fixture pengaturan hari/jam kerja dan hari libur (CAL-03 F6).
 *
 * Default fixture: Senin-Jumat 08:00-17:00 (Asia/Jakarta) dan dua libur pada
 * pekan fixture (Kamis 2026-03-12 sebagai cuti bersama, Sabtu 2026-03-14
 * sebagai libur nasional) supaya test dapat membedakan libur, akhir pekan,
 * dan hari kerja.
 */
export const WORK_CALENDAR_FIXTURE_WORK_SETTINGS: WorkCalendarWorkSettings = Object.freeze({
  workDays: Object.freeze([1, 2, 3, 4, 5]),
  workStart: "08:00",
  workEnd: "17:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  timezone: "Asia/Jakarta",
});

export const WORK_CALENDAR_FIXTURE_HOLIDAYS: readonly WorkCalendarHoliday[] = Object.freeze([
  {
    date: "2026-03-12",
    name: "Cuti Bersama Nyepi",
    isCutiBersama: true,
  },
  {
    date: "2026-03-14",
    name: "Hari Raya Nyepi",
    isCutiBersama: false,
  },
]);

export function createFixtureWorkCalendarSettingsRepository(options: {
  settings?: WorkCalendarWorkSettings;
  holidays?: readonly WorkCalendarHoliday[];
  failOnSettings?: boolean;
  failOnHolidays?: boolean;
} = {}): WorkCalendarSettingsRepository {
  const settings = options.settings ?? WORK_CALENDAR_FIXTURE_WORK_SETTINGS;
  const holidays = options.holidays ?? WORK_CALENDAR_FIXTURE_HOLIDAYS;

  return {
    async getWorkSettings(signal?: AbortSignal) {
      if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
      if (options.failOnSettings) throw new Error("Gagal memuat pengaturan (fixture).");
      return settings;
    },
    async listHolidays({ fromDate, toDate, signal }) {
      if (signal?.aborted) throw new Error("Pencarian dibatalkan.");
      if (options.failOnHolidays) throw new Error("Gagal memuat hari libur (fixture).");
      return holidays.filter(
        (holiday) => holiday.date >= fromDate && holiday.date <= toDate,
      );
    },
  };
}

/**
 * Marker modul legacy untuk audit batas CAL-03 F1.
 *
 * `WORK_CALENDAR_LEGACY_IMPORT_MARKERS` adalah nama modul/identifier lama yang
 * tidak boleh dipakai fitur work calendar.
 */
export const WORK_CALENDAR_LEGACY_IMPORT_MARKERS: readonly string[] = [
  "AgendaPage",
  "AgendaTabs",
  "AgendaCard",
  "AgendaModal",
  "AgendaDetailModal",
  "CalendarView",
  "CalendarAgendaItem",
  "/services/agenda.service",
  "agenda.adapter",
  "agendaSchema",
  "exportCalendarData",
];

/** Lokasi modul legacy yang tidak boleh diimpor fitur work calendar. */
export const WORK_CALENDAR_LEGACY_MODULE_PATHS: readonly string[] = [
  "/components/agenda/",
  "/components/calendar/",
  "/pages/agenda/",
  "/pages/calendar/",
  "/services/agenda",
  "/services/export.service",
  "/adapters/agenda.adapter",
  "/types/agenda",
];

/**
 * Identifier legacy yang tidak boleh diimpor fitur work calendar.
 * `CalendarView` di sini berarti identifier persis, bukan substring dari
 * `WorkCalendarViewModel`.
 */
export const WORK_CALENDAR_LEGACY_IDENTIFIERS: readonly string[] = [
  "AgendaPage",
  "AgendaTabs",
  "AgendaCard",
  "AgendaModal",
  "AgendaDetailModal",
  "CalendarView",
  "CalendarAgendaItem",
  "agendaSchema",
  "exportCalendarData",
];

function extractImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) specifiers.add(match[1]);
  for (const match of source.matchAll(/(?:^|[\s;])import\s+["']([^"']+)["']/gm)) specifiers.add(match[1]);
  return [...specifiers];
}

function extractNamedBindings(source: string): string[] {
  const bindings = new Set<string>();
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) bindings.add(name);
    }
  }
  for (const match of source.matchAll(/import\s+(?:type\s+)?(\w+)\s+from/g)) bindings.add(match[1]);
  return [...bindings];
}

/**
 * Cari jejak modul legacy pada sebuah berkas: impor dari path legacy
 * (mis. `@/pages/agenda/AgendaPage`) atau impor identifier legacy.
 */
export function findLegacyWorkCalendarImports(source: string): string[] {
  const found = new Set<string>();
  for (const specifier of extractImportSpecifiers(source)) {
    for (const legacyPath of WORK_CALENDAR_LEGACY_MODULE_PATHS) {
      if (specifier.includes(legacyPath)) found.add(specifier);
    }
  }
  for (const binding of extractNamedBindings(source)) {
    if (WORK_CALENDAR_LEGACY_IDENTIFIERS.includes(binding)) found.add(binding);
  }
  return [...found];
}

export function isFixtureOwnerId(ownerId: WorkEntryOwnerId): boolean {
  return (
    ownerId === WORK_CALENDAR_FIXTURE_CURRENT_USER.id ||
    WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.some((member) => member.id === ownerId)
  );
}
