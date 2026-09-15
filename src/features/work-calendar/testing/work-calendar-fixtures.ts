/**
 * Fixture Unified Work Calendar.
 *
 * HANYA untuk test dan visual verification. Modul ini tidak boleh diimpor
 * oleh barrel `index.ts` maupun oleh runtime aplikasi production.
 */

import type {
  WorkEntry,
  WorkEntryDraft,
  WorkEntryOwner,
  WorkEntryOwnerId,
  WorkEntryRepository,
  WorkDate,
} from "../types/work-calendar";
import { isWorkDateWithin, shiftWorkDate } from "../lib/work-calendar-date";

export const WORK_CALENDAR_FIXTURE_TODAY: WorkDate = "2026-03-10";

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
  options: { failOnList?: boolean } = {},
): WorkEntryRepository {
  const store = new Map<string, WorkEntry>(seed.map((entry) => [entry.id, entry]));
  let counter = seed.length;

  const listInRange = (fromDate: WorkDate, toDate: WorkDate): WorkEntry[] =>
    [...store.values()]
      .filter((entry) => entry.deletedAt === null && isWorkDateWithin(entry.workDate, fromDate, toDate))
      .sort((left, right) => (left.workDate < right.workDate ? -1 : left.workDate > right.workDate ? 1 : 0));

  return {
    async listEntries({ ownerId, fromDate, toDate }) {
      if (options.failOnList) throw new Error("Gagal memuat data pekerjaan (fixture).");
      return listInRange(fromDate, toDate).filter((entry) => entry.ownerId === ownerId);
    },
    async listTeamEntries({ managerId, fromDate, toDate }) {
      if (options.failOnList) throw new Error("Gagal memuat data pekerjaan (fixture).");
      return listInRange(fromDate, toDate).filter((entry) => entry.ownerId !== managerId);
    },
    async createEntry(draft: WorkEntryDraft) {
      counter += 1;
      const now = new Date().toISOString();
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
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.set(entry.id, entry);
      return entry;
    },
    async updateEntry({ entryId, patch, expectedUpdatedAt }) {
      const current = store.get(entryId);
      if (!current) throw new Error("Entry tidak ditemukan.");
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        const error = Object.assign(new Error("Data telah berubah"), {
          name: "WorkEntryConflictError",
          code: "WORK_ENTRY_CONFLICT",
        });
        throw error;
      }
      const next: WorkEntry = { ...current, ...patch, updatedAt: new Date().toISOString() };
      store.set(entryId, next);
      return next;
    },
    async deleteEntry({ entryId, expectedUpdatedAt }) {
      const current = store.get(entryId);
      if (!current) return;
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        const error = Object.assign(new Error("Data telah berubah"), {
          name: "WorkEntryConflictError",
          code: "WORK_ENTRY_CONFLICT",
        });
        throw error;
      }
      store.set(entryId, { ...current, deletedAt: new Date().toISOString() });
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
