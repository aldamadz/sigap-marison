/**
 * Seleksi entry lewat query parameter `entry` (CAL-03 F4B).
 *
 * Kontrak:
 * - detail yang terbuka selalu berasal dari URL (`?entry=<id>`), bukan state
 *   tersembunyi, sehingga refresh/deep link/Back/Forward konsisten;
 * - filter lain (`date`, `view`, `office`, ...) tidak pernah disentuh;
 * - id yang bentuknya tidak valid ATAU tidak dapat diresolusi (tidak ada di
 *   data yang boleh dilihat pengguna) dibuang dari URL, bukan dibiarkan
 *   menggantung dan bukan menampilkan data yang bukan haknya.
 *
 * Modul ini murni: tanpa DOM, tanpa jaringan, tanpa React.
 */

import type { WorkEntry } from "../types/work-calendar";

/** Kunci query parameter untuk entry terpilih. */
export const WORK_ENTRY_QUERY_KEY = "entry";

/**
 * Batas panjang id yang diterima dari URL. Id asli (uuid) jauh lebih pendek;
 * batas ini hanya untuk menolak nilai yang jelas tidak masuk akal.
 */
export const WORK_ENTRY_QUERY_ID_MAX_LENGTH = 128;

/**
 * Normalisasi nilai `entry` dari URL. Mengembalikan `null` bila nilai kosong,
 * hanya spasi, terlalu panjang, atau mengandung kontrol/whitespace internal.
 */
export function normalizeWorkEntryQueryId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > WORK_ENTRY_QUERY_ID_MAX_LENGTH) return null;
  if (value !== value.trim()) return null;
  // Id yang valid tidak pernah memuat whitespace atau karakter kontrol.
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return null;
  }
  return value;
}

export interface ResolveSelectedWorkEntryInput {
  /** Id dari query parameter, sudah dinormalisasi. */
  requestedId: string | null;
  /** Kumpulan entry yang sedang terlihat pada tampilan aktif. */
  entries: readonly WorkEntry[];
  /** Kumpulan entry tambahan (mis. pekerjaan anggota yang sedang dibuka). */
  extraEntries?: readonly WorkEntry[];
}

/**
 * Cari entry terpilih di antara data yang boleh dilihat. Pencarian tidak
 * pernah memakai data yang belum dimuat, sehingga entry milik orang lain
 * tidak dapat muncul hanya karena id-nya ditebak.
 */
export function resolveSelectedWorkEntry(
  input: ResolveSelectedWorkEntryInput,
): WorkEntry | null {
  const { requestedId, entries, extraEntries } = input;
  if (!requestedId) return null;
  return (
    entries.find((entry) => entry.id === requestedId) ??
    extraEntries?.find((entry) => entry.id === requestedId) ??
    null
  );
}

export interface ShouldDiscardWorkEntryQueryIdInput {
  requestedId: string | null;
  resolvedEntry: WorkEntry | null;
  /** Apakah data yang relevan untuk tampilan aktif sudah selesai dimuat. */
  dataReady: boolean;
}

/**
 * `true` bila id dari URL harus dibuang. Id hanya dibuang setelah data selesai
 * dimuat, supaya deep link yang valid tidak terhapus saat pemuatan berjalan.
 */
export function shouldDiscardWorkEntryQueryId(
  input: ShouldDiscardWorkEntryQueryIdInput,
): boolean {
  const { requestedId, resolvedEntry, dataReady } = input;
  if (!requestedId) return false;
  if (!dataReady) return false;
  return resolvedEntry === null;
}
