export type NonUnitExternalOption = {
  value: string;
  label: string;
  raw?: Record<string, unknown>;
};

export type NonUnitRequestRow = Record<string, unknown> & {
  non_unit_id?: number;
  item_name?: string;
  nama_barang?: string;
  subtotal?: number;
  planning_notes?: string;
};

export type NonUnitRowError = {
  index: number;
  field: "non_unit_id" | "item_name" | "subtotal";
  message: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const parseNonUnitMoney = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};

export const formatNonUnitMoneyInput = (value: unknown): string => {
  const amount = parseNonUnitMoney(value);
  return amount > 0 ? new Intl.NumberFormat("id-ID").format(amount) : "";
};

export const formatNonUnitCurrency = (value: unknown): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parseNonUnitMoney(value));

export const normalizeNonUnitOption = (value: unknown): NonUnitExternalOption | null => {
  const record = asRecord(value);
  const raw = asRecord(record.raw);
  const id = Number(raw.id ?? raw.non_unit_id ?? record.value ?? record.non_unit_id);
  const label = String(record.label ?? raw.name ?? "").trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !label) return null;
  return {
    value: String(id),
    label,
    raw: {
      id,
      code: String(raw.code ?? "").trim(),
      name: String(raw.name ?? label).trim(),
      description: String(raw.description ?? "").trim(),
      project_id: Number(raw.project_id ?? 0) || null,
      has_submitted: raw.has_submitted === true,
    },
  };
};

export const getNonUnitRowOption = (row: NonUnitRequestRow): NonUnitExternalOption | null => {
  const raw = asRecord(row.raw);
  return normalizeNonUnitOption({
    value: row.non_unit_id ?? row.value ?? raw.id,
    label: row.non_unit_name ?? row.label ?? raw.name,
    raw,
  });
};

export const updateNonUnitRow = (
  current: NonUnitRequestRow,
  patch: Partial<NonUnitRequestRow>,
): NonUnitRequestRow => {
  const next = { ...current, ...patch };
  const itemName = String(next.item_name ?? next.nama_barang ?? "").trimStart();
  const subtotal = parseNonUnitMoney(next.subtotal);
  const planningNotes = String(next.planning_notes ?? "").trimStart();
  return {
    ...next,
    item_name: itemName,
    nama_barang: itemName,
    subtotal,
    planning_notes: planningNotes,
    kode: String(next.kode ?? asRecord(next.raw).code ?? "").trim(),
    sat: "Pekerjaan",
    satuan: "Pekerjaan",
    jumlah: "1",
    status: "2",
    keterangan: subtotal > 0 ? formatNonUnitCurrency(subtotal) : "",
  };
};

export const selectNonUnitType = (
  current: NonUnitRequestRow,
  option: NonUnitExternalOption,
): NonUnitRequestRow => {
  const normalized = normalizeNonUnitOption(option);
  if (!normalized) return current;
  return updateNonUnitRow(current, {
    non_unit_id: Number(normalized.value),
    non_unit_name: normalized.label,
    value: normalized.value,
    label: normalized.label,
    raw: normalized.raw,
    kode: String(normalized.raw?.code ?? ""),
  });
};

export const hasMeaningfulNonUnitRow = (row: NonUnitRequestRow): boolean =>
  Boolean(
    Number(row.non_unit_id ?? 0) > 0 ||
    String(row.item_name ?? row.nama_barang ?? "").trim() ||
    parseNonUnitMoney(row.subtotal) > 0 ||
    String(row.planning_notes ?? "").trim()
  );

export const validateNonUnitRows = (value: unknown): NonUnitRowError[] => {
  const rows = Array.isArray(value)
    ? value.filter((row): row is NonUnitRequestRow =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row) && hasMeaningfulNonUnitRow(row as NonUnitRequestRow)
      )
    : [];
  if (rows.length === 0) {
    return [{ index: 0, field: "item_name", message: "Tambahkan minimal satu pekerjaan Non Unit." }];
  }
  return rows.flatMap((row, index) => {
    const errors: NonUnitRowError[] = [];
    if (!Number.isSafeInteger(Number(row.non_unit_id)) || Number(row.non_unit_id) <= 0) {
      errors.push({ index, field: "non_unit_id", message: `Pilih jenis pekerjaan untuk item ${index + 1}.` });
    }
    if (!String(row.item_name ?? row.nama_barang ?? "").trim()) {
      errors.push({ index, field: "item_name", message: `Isi nama pekerjaan untuk item ${index + 1}.` });
    }
    if (parseNonUnitMoney(row.subtotal) <= 0) {
      errors.push({ index, field: "subtotal", message: `Isi nilai pengajuan lebih dari 0 untuk item ${index + 1}.` });
    }
    return errors;
  });
};

export const getNonUnitTotal = (value: unknown): number =>
  Array.isArray(value)
    ? value.reduce((total, row) => total + parseNonUnitMoney(asRecord(row).subtotal), 0)
    : 0;

export const isNonUnitRequestRows = (value: unknown): boolean =>
  Array.isArray(value) && value.some((row) => {
    const record = asRecord(row);
    return Boolean(record.non_unit_id || record.item_name || record.planning_notes);
  });
