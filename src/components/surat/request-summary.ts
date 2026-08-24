export const formatRequestCategory = (value: unknown) => {
  const category = String(value || "").toLowerCase();
  if (category === "asset") return "Aset";
  if (category === "unit") return "Unit";
  if (category === "non_unit") return "Non Unit";
  if (category === "non_asset") return "Non Aset";
  return String(value || "-");
};

export const formatSummaryValue = (value: unknown): string => {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const record = entry as Record<string, unknown>;
        return record.label || record.name || record.code || record.value;
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    const entry = value as Record<string, unknown>;
    return String(entry.label || entry.name || entry.code || entry.value || "-");
  }
  return String(value);
};

export const humanizeInputKey = (key: string) => {
  const labels: Record<string, string> = {
    catatan: "Catatan",
    nama_barang: "Nama Barang",
    sat: "Satuan",
    jumlah: "Jumlah",
    status: "Status",
    keterangan: "Keterangan",
    non_unit_id: "ID Non Unit",
    non_unit_name: "Jenis Pekerjaan",
    item_name: "Nama Pekerjaan",
    subtotal: "Nilai Pengajuan",
    planning_notes: "Catatan Perencanaan",
    kode: "Kode",
    requested_unit_count: "Jumlah Unit Diajukan",
    requested_project: "Proyek Diajukan",
    allocated_project: "Proyek Dialokasikan",
    allocated_units: "Kavling yang dipilih",
    allocated_unit_count: "Jumlah Kavling Dipilih",
    requires_recommendation: "Perlu Rekomendasi",
    recommendation_template_name: "Template Rekomendasi",
    recommendation_attachment_note: "Catatan Rekomendasi",
    reference_link: "Link Referensi",
    items: "Daftar Barang / Pekerjaan",
  };
  return labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const formatLongDate = (value?: string | null) => {
  if (!value) return "-";
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
};

export const getSafeExternalUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};
