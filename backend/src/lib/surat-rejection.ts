export type SuratRejectionRequest = {
  documentNumber: string;
  reason: string;
  note: string | null;
};

const readAliasedText = (
  payload: Record<string, unknown>,
  keys: string[],
  label: string,
  maxLength: number,
  required: boolean,
) => {
  const supplied = keys
    .filter((key) => payload[key] !== undefined && payload[key] !== null)
    .map((key) => {
      const raw = payload[key];
      if (typeof raw !== "string") throw new Error(`${label} harus berupa teks.`);
      return raw.trim();
    });
  const distinct = [...new Set(supplied)];
  if (distinct.length > 1) throw new Error(`${label} memiliki nilai alias yang berbeda.`);
  const value = distinct[0] || "";
  if (required && !value) throw new Error(`${label} wajib diisi.`);
  if (value.length > maxLength) throw new Error(`${label} maksimal ${maxLength} karakter.`);
  return value;
};

export const normalizeSuratRejectionRequest = (payload: unknown): SuratRejectionRequest => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Body request harus berupa object JSON.");
  }
  const body = payload as Record<string, unknown>;
  const documentNumber = readAliasedText(
    body,
    ["document_number", "request_number", "no_surat"],
    "Nomor dokumen",
    255,
    true,
  );
  const reason = readAliasedText(body, ["reason", "alasan"], "Alasan penolakan", 1000, true);
  const note = readAliasedText(body, ["note", "catatan"], "Catatan penolakan", 2000, false);
  return { documentNumber, reason, note: note || null };
};

export const mapSuratRejectionRpcError = (error: { code?: string; message?: string }) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "Gagal menolak pengajuan.");
  if (code === "22023") return { status: 400, message };
  if (code === "P0002") return { status: 404, message: "Dokumen tidak ditemukan atau tidak tersedia untuk ditolak." };
  if (code === "42501") return { status: 403, message: "Anda tidak berwenang menolak dokumen ini." };
  if (code === "21000" || code === "55000" || code === "40001") return { status: 409, message };
  return { status: 503, message: "Gagal memproses penolakan dokumen." };
};
