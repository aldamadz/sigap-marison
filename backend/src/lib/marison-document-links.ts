type StorageReference = { bucket: string; path: string; origin?: string | null };
type Attachment = { id?: string; signature_id?: string | null; stage?: string | null; requirement_key?: string | null; file_url?: string | null; file_name?: string | null; file_type?: string | null; requirement_label?: string | null };
export type ExternalFileReference = { kind: "main_pdf" | "attachment_pdf"; attachmentId?: string; singleton?: boolean };
type ExternalAttachment = { name: string; link: string };

const documentError = (message: string) => Object.assign(new Error(message), {
  status: 422, code: "main_document_unavailable",
});

const isHttpLink = (value: string | null): value is string => {
  try { return value !== null && ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
};

const referenceKey = (ref: StorageReference) => JSON.stringify([ref.origin || "primary", ref.bucket, ref.path]);

export const buildMarisonDocumentBundle = async ({ finalPdfPath, attachments, parseRef, mintLink }: {
  finalPdfPath: string | null;
  attachments: Attachment[];
  parseRef: (path: string) => StorageReference | null;
  mintLink: (path: string, reference?: ExternalFileReference) => Promise<string | null>;
}): Promise<{ mainDocument: string; attachments: ExternalAttachment[] }> => {
  const mainRef = finalPdfPath ? parseRef(finalPdfPath) : null;
  if (!finalPdfPath || !mainRef) throw documentError("PDF final dokumen utama belum tersedia untuk pengiriman.");
  const mainDocument = await mintLink(finalPdfPath, { kind: "main_pdf" });
  if (!isHttpLink(mainDocument)) throw documentError("Tautan dokumen utama belum tersedia untuk pengiriman.");

  const seen = new Set([referenceKey(mainRef)]);
  const supplementary: ExternalAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment?.file_url) continue;
    const ref = parseRef(attachment.file_url);
    if (!ref || seen.has(referenceKey(ref))) continue;
    seen.add(referenceKey(ref));
    const isPdf = attachment.file_type === "application/pdf" || /\.pdf$/i.test(attachment.file_name || attachment.file_url);
    const slotCount = attachments.filter(row => row.signature_id === attachment.signature_id && row.stage === attachment.stage && row.requirement_key === attachment.requirement_key).length;
    const link = await mintLink(attachment.file_url, isPdf && attachment.id
      ? { kind: "attachment_pdf", attachmentId: attachment.id, singleton: slotCount === 1 } : undefined);
    if (!isHttpLink(link)) throw documentError("Tautan lampiran belum tersedia untuk pengiriman.");
    supplementary.push({
      name: attachment.requirement_label?.trim() || attachment.file_name?.trim() || `Lampiran ${index + 1}`,
      link,
    });
  }
  return { mainDocument, attachments: supplementary };
};
