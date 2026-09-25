export const VERIFIER_OPTIONAL_ATTACHMENT_KEY = "verifier_additional";

type UploadFile = { name: string; type: string; size: number };
type UploadMetadata = { key?: unknown };

const reject = (message: string, status: number) => {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
};

export function validateVerifierOptionalUpload(input: {
  stage: string;
  metadata: UploadMetadata[];
  files: UploadFile[];
  actorId: string;
  verifierIds: string[];
  verificationRequired: boolean;
  verificationStatus: string | null;
}): void {
  const optional = input.metadata.filter(item => item?.key === VERIFIER_OPTIONAL_ATTACHMENT_KEY);
  if (optional.length === 0) return;
  if (input.stage !== "approval" || !input.verificationRequired || input.verificationStatus === "verified" || !input.verifierIds.includes(input.actorId)) {
    throw reject("Lampiran tambahan hanya dapat diunggah oleh tim pemeriksa pada tugas aktif.", 403);
  }
  if (input.metadata.length !== input.files.length || optional.length > 5) {
    throw reject("Jumlah lampiran tambahan tidak valid (maksimal 5 file).", 422);
  }
  for (const [index, item] of input.metadata.entries()) {
    if (item?.key !== VERIFIER_OPTIONAL_ATTACHMENT_KEY) continue;
    const file = input.files[index];
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size < 1 || file.size > 4 * 1024 * 1024) {
      throw reject(`Lampiran ${file.name} harus PDF, JPG, atau PNG dengan ukuran maksimal 4 MB.`, 422);
    }
  }
}

export function hasValidOptionalFileSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  return false;
}
