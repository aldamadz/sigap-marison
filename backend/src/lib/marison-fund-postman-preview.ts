import { createHash } from "node:crypto";
import { assertMarisonOutboundContract } from "../../../server/marison-outbound-contract.mjs";

type Ref = { origin?: string | null; bucket: string; path: string };
type Capability = {
  token_hash: string; surat_id: string | null; purpose: string;
  storage_origin: string | null; bucket: string; object_path: string;
  expires_at: string | null; revoked_at: string | null; consumed_at: string | null;
};
type Attachment = { name: string; link: string };
const blocked = () => Object.assign(new Error("Payload untuk Postman belum siap. PDF final atau tautan lampiran tersimpan tidak lagi sesuai/aktif; hubungi operator. Riwayat pengiriman tidak diubah."), { status: 409 });
const refKey = (ref: Ref) => JSON.stringify([ref.origin || "primary", ref.bucket, ref.path]);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// Only reuse existing capabilities. Reading this preview must never mint a link.
export function fundPostmanLinks(payload: Record<string, unknown>, appUrl: string) {
  const attachments = payload.attachments;
  if (!Array.isArray(attachments) || attachments.length > 128) throw blocked();
  const links: string[] = [];
  if (payload.main_document != null) {
    if (typeof payload.main_document !== "string") throw blocked();
    links.push(payload.main_document);
  }
  for (const item of attachments) {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || typeof item.link !== "string") throw blocked();
    links.push(item.link);
  }
  return [...new Set(links)].map(link => {
    try {
      const url = new URL(link), app = new URL(appUrl);
      const match = /^\/api\/files\/view\/([A-Za-z0-9_-]{22,128})(?:\/[^?#]*)?$/.exec(url.pathname);
      if (url.protocol !== "https:" || url.origin !== app.origin || url.username || url.password || url.search || url.hash || !match) throw blocked();
      return { link, tokenHash: sha256(match[1]) };
    } catch { throw blocked(); }
  });
}

export function previewFundForPostman({ payload, suratId, finalPdf, currentAttachments, links, capabilities, parseRef, now = Date.now() }: {
  payload: Record<string, unknown>; suratId: string; finalPdf: string | null;
  currentAttachments: { file_url: string | null }[];
  links: ReturnType<typeof fundPostmanLinks>; capabilities: Capability[];
  parseRef: (value: string) => Ref | null; now?: number;
}) {
  const mainRef = finalPdf ? parseRef(finalPdf) : null;
  if (!mainRef) throw blocked();
  const mainKey = refKey(mainRef);
  const refs = new Map<string, string>();
  for (const { link, tokenHash } of links) {
    const token = capabilities.find(value => value.token_hash === tokenHash);
    if (!token || token.surat_id !== suratId || token.revoked_at || token.consumed_at ||
      !["external_marison", "email"].includes(token.purpose) ||
      (token.expires_at !== null && (!Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) <= now))) throw blocked();
    refs.set(link, refKey({ origin: token.storage_origin, bucket: token.bucket, path: token.object_path }));
  }
  const main = links.find(value => refs.get(value.link) === mainKey)?.link;
  if (!main || (payload.main_document != null && refs.get(String(payload.main_document)) !== mainKey)) throw blocked();
  const attachments = (payload.attachments as Attachment[]).filter(item => refs.get(item.link) !== mainKey);
  const included = new Set(attachments.map(item => refs.get(item.link)));
  for (const item of currentAttachments) {
    if (!item.file_url) continue;
    const ref = parseRef(item.file_url);
    if (!ref || (refKey(ref) !== mainKey && !included.has(refKey(ref)))) throw blocked();
  }
  const candidate = structuredClone(payload);
  candidate.main_document = main;
  candidate.attachments = attachments;
  try { assertMarisonOutboundContract("fund", candidate); } catch { throw blocked(); }
  const removed = (payload.attachments as Attachment[]).length - attachments.length;
  return {
    payload: candidate,
    payloadHash: sha256(JSON.stringify(candidate)),
    changes: [
      payload.main_document ? "Dokumen utama dipertahankan pada main_document." : "Dokumen utama dipisahkan ke main_document.",
      `${removed} salinan dokumen utama dilepas dari attachments; ${attachments.length} lampiran pendukung dipertahankan.`,
      "Jenis dana, nominal, rincian, identitas, dan persetujuan tidak diubah.",
    ],
  };
}
