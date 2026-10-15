type StorageReference = { bucket: string; path: string; origin?: string | null };
type Attachment = { file_url?: string | null; file_name?: string | null; requirement_label?: string | null };
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
  mintLink: (path: string) => Promise<string | null>;
}): Promise<{ mainDocument: string; attachments: ExternalAttachment[] }> => {
  const mainRef = finalPdfPath ? parseRef(finalPdfPath) : null;
  if (!finalPdfPath || !mainRef) throw documentError("PDF final dokumen utama belum tersedia untuk pengiriman.");
  const mainDocument = await mintLink(finalPdfPath);
  if (!isHttpLink(mainDocument)) throw documentError("Tautan dokumen utama belum tersedia untuk pengiriman.");

  const seen = new Set([referenceKey(mainRef)]);
  const supplementary: ExternalAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    if (!attachment?.file_url) continue;
    const ref = parseRef(attachment.file_url);
    if (!ref || seen.has(referenceKey(ref))) continue;
    seen.add(referenceKey(ref));
    const link = await mintLink(attachment.file_url);
    if (!isHttpLink(link)) throw documentError("Tautan lampiran belum tersedia untuk pengiriman.");
    supplementary.push({
      name: attachment.requirement_label?.trim() || attachment.file_name?.trim() || `Lampiran ${index + 1}`,
      link,
    });
  }
  return { mainDocument, attachments: supplementary };
};
