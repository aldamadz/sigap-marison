import type { MasterRecord } from "./surat-form-types";

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDatePickerDisplay(value?: string | null): string {
  const date = parseDateInputValue(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatIndonesianList(values: string[]): string {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} dan ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, dan ${cleaned[cleaned.length - 1]}`;
}

export function buildNonUnitRequestTitle(itemText: string, officeSuffix: string): string {
  const compactOfficeSuffix = officeSuffix
    .replace(/^(KC|KCP)\.\s*/i, (_, prefix: string) => `${prefix.toUpperCase()} `)
    .trim();
  const detail = [itemText.trim(), compactOfficeSuffix]
    .filter(Boolean)
    .join(" ");
  return detail ? `Permohonan Non Unit : ${detail}` : "Permohonan Non Unit";
}

export const toReadableLocationName = (value: string): string => value
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

export function getDepartmentTitlePart(department?: MasterRecord | null): string {
  const rawName = String(department?.name || "").replace(/\s*\(cabang\)\s*/i, "").trim();
  if (!rawName) return "";
  if (/^dept\.?\s+/i.test(rawName)) return rawName.replace(/^dept\.?\s+/i, "Dept. ");
  return `Dept. ${rawName}`;
}

export function getOfficeTitleSuffix(office?: MasterRecord | null, department?: MasterRecord | null): string {
  if (!office) return "";
  const name = String(office.name || "").trim();
  const kedudukan = String(office.kedudukan || "").trim().toUpperCase();
  if (kedudukan === "PUSAT" || name.toUpperCase().includes("KANTOR PUSAT")) {
    return [getDepartmentTitlePart(department), "Kantor Pusat"].filter(Boolean).join(" ");
  }
  if (kedudukan === "KCP" || /^KCP\b|^KCP\./i.test(name)) {
    return `KCP. ${toReadableLocationName(name.replace(/^KCP\.?\s*/i, ""))}`.trim();
  }
  if (kedudukan === "KC" || /^KC\b|^KC\./i.test(name)) {
    return `KC. ${toReadableLocationName(name.replace(/^KC\.?\s*/i, ""))}`.trim();
  }
  return name;
}

export function getDefaultRequestPlace(
  office?: MasterRecord | null,
  department?: MasterRecord | null,
): string {
  const suffix = getOfficeTitleSuffix(office, department);
  if (!suffix || suffix.includes("Kantor Pusat")) return "Magelang";
  return suffix.replace(/^(KC|KCP)\.\s+/i, "").trim() || "Magelang";
}

export function formatFileSize(bytes?: number | null): string {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export const normalizeNameSearch = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

export function getShortPersonName(name?: string | null): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts[0] || "PIC";
}

export const toReadableName = (value?: string | null): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function getDepartmentShortLabel(department?: MasterRecord | null): string {
  const code = String(department?.code || "").trim().toUpperCase();
  const name = String(department?.name || "").trim();
  const normalizedName = name.toLowerCase();
  if (code === "PBO" || normalizedName === "pengembangan organisasi") return "PO";
  if (code === "HRD" || normalizedName.includes("hrd")) return "HRD";
  if (code === "KEU" || normalizedName.includes("keuangan")) return "Keu";
  if (code === "MKT" || normalizedName.includes("marketing")) return "Marketing";
  return code || name || "Pusat";
}

export function getOfficeShortLabel(office?: MasterRecord | null): string {
  const kedudukan = String(office?.kedudukan || "").trim();
  const name = String(office?.name || "").trim();
  if (!name) return kedudukan || "Kantor";
  const normalized = name.replace(/\s+/g, " ").trim();
  const prefixed = normalized.match(/^(KC|KCP)\s+(.+)$/i);
  if (prefixed) return `${prefixed[1].toUpperCase()}. ${toReadableName(prefixed[2])}`;
  if (/^KOST\s+/i.test(normalized)) return toReadableName(normalized);
  if (kedudukan && kedudukan.toLowerCase() !== "pusat") return `${kedudukan.toUpperCase()}. ${toReadableName(normalized)}`;
  return toReadableName(normalized);
}
