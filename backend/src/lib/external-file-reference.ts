type Ref = { bucket: string; path: string; origin?: string | null };
type Attachment = { id: string; surat_id?: string; signature_id?: string | null; stage?: string | null; requirement_key?: string | null; file_url: string; file_name?: string | null; file_type?: string | null };
type Token = { id: string; surat_id: string | null; purpose: string; bucket: string; object_path: string; storage_origin?: string | null; revoked_at?: string | null; expires_at?: string | null; reference_kind?: string | null; reference_attachment_id?: string | null; reference_slot_singleton?: boolean };
type Document = { id: string; status: string; file_path?: string | null; pdf_path?: string | null; surat_signatures?: { id: string; step_order: number; is_signed: boolean; signed_at: string | null; pdf_path_snap?: string | null }[] };
type Job = { status: string; pdf_url: string | null; source_file_path?: string | null; signature_id: string | null };
const key = (ref: Ref) => JSON.stringify([ref.origin || "primary", ref.bucket, ref.path]);
const unavailable = () => Object.assign(new Error("Versi PDF external tidak tersedia atau referensi lampirannya tidak lagi jelas."), { status: 410 });
const sameSlot = (left: Attachment, right: Attachment) => left.signature_id === right.signature_id && left.stage === right.stage && left.requirement_key === right.requirement_key;

export function chooseExternalFileReference({ token, document, jobs, attachments, history, parseRef, now = Date.now() }: {
  token: Token; document: Document | null; jobs: Job[]; attachments: Attachment[]; history: Attachment[];
  parseRef: (path: string) => Ref | null; now?: number;
}): Ref {
  const original = { bucket: token.bucket, path: token.object_path, origin: token.storage_origin || "primary" };
  if (token.purpose !== "external_marison") return original;
  if (token.revoked_at || (token.expires_at && (!Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) <= now))) throw unavailable();
  if (!document || document.id !== token.surat_id) throw unavailable();
  // Never make an unapproved working revision available through a delivered link.
  if (!["DONE", "SELESAI", "COMPLETED"].includes(document.status.toUpperCase())) return original;
  if (!document.surat_signatures?.length || document.surat_signatures.some(row => !row.is_signed || !row.signed_at)) throw unavailable();
  const matches = (url?: string | null) => { const ref = url ? parseRef(url) : null; return ref && key(ref) === key(original); };
  const rows = [...attachments, ...history].filter(row => row.surat_id === document.id);
  const matchingAttachments = rows.filter(row => matches(row.file_url));
  const ids = [...new Set(matchingAttachments.map(row => row.id))];
  const maxStep = Math.max(...document.surat_signatures.map(row => Number(row.step_order)));
  const finalSignerIds = new Set(document.surat_signatures.filter(row => Number(row.step_order) === maxStep).map(row => row.id));
  const isMain = token.reference_kind === "main_pdf" || (!token.reference_kind && (
    matches(document.pdf_path) || jobs.some(job => job.status === "done" && (!job.signature_id || finalSignerIds.has(job.signature_id)) && matches(job.pdf_url))
  ));
  if (isMain) {
    if (!token.reference_kind && ids.length) throw unavailable();
    const candidate = document.pdf_path ? parseRef(document.pdf_path) : null;
    if (!candidate) return original;
    if ((candidate.origin || "primary") !== (original.origin || "primary")) throw unavailable();
    if (!jobs.some(job => job.status === "done" && !job.signature_id && job.source_file_path === document.file_path && job.pdf_url === document.pdf_path)) return original;
    return candidate;
  }
  const attachmentId = token.reference_kind === "attachment_pdf" ? token.reference_attachment_id : ids.length === 1 ? ids[0] : null;
  if (!attachmentId) {
    if (ids.length > 1 || token.reference_kind) throw unavailable();
    return original;
  }
  const anchor = rows.find(row => row.id === attachmentId && matches(row.file_url)) || rows.find(row => row.id === attachmentId);
  if (!anchor) throw unavailable();
  const exact = attachments.filter(row => row.surat_id === document.id && row.id === attachmentId);
  let candidate = exact.length === 1 ? exact[0] : null;
  if (!candidate) {
    const generated = ["rekap_adendum_unit", "kode_produksi_unit"].includes(anchor.requirement_key || "");
    const slot = attachments.filter(row => row.surat_id === document.id && sameSlot(anchor, row));
    const named = slot.filter(row => row.file_name === anchor.file_name);
    if ((generated || token.reference_slot_singleton) && slot.length === 1) candidate = slot[0];
    else if (named.length === 1) candidate = named[0];
  }
  if (!candidate || (candidate.file_type !== "application/pdf" && !/\.pdf$/i.test(candidate.file_name || ""))) throw unavailable();
  const ref = parseRef(candidate.file_url);
  if (!ref || (ref.origin || "primary") !== (original.origin || "primary")) throw unavailable();
  return ref;
}

// This resolver only reads canonical metadata. It never mints links or changes jobs.
export async function resolveExternalFileReference(client: any, tokenId: string, parseRef: (path: string) => Ref | null, supplied?: Token, consumedReference?: Ref): Promise<Ref> {
  let token = supplied;
  if (!token) {
    const result = await client.from("file_view_tokens").select("*").eq("id", tokenId).maybeSingle();
    if (result.error || !result.data) throw unavailable();
    token = result.data as Token;
  }
  if (token.purpose !== "external_marison" || !/\.pdf$/i.test(token.object_path)) {
    return consumedReference || { bucket: token.bucket, path: token.object_path, origin: token.storage_origin || "primary" };
  }
  const publication = () => client.from("surat_registrasi")
    .select("id,status,updated_at,file_path,pdf_path,surat_signatures(id,step_order,is_signed,signed_at,pdf_path_snap)").eq("id", token.surat_id).maybeSingle();
  const result = await publication();
  if (result.error || !result.data) throw unavailable();
  const [jobResult, attachmentResult, historyResult] = await Promise.all([
    client.from("document_pdf_jobs").select("status,pdf_url,source_file_path,signature_id").eq("surat_id", token.surat_id).eq("status", "done").order("created_at", { ascending: false }).limit(1000),
    client.from("surat_attachments").select("id,surat_id,signature_id,stage,requirement_key,file_url,file_name,file_type").eq("surat_id", token.surat_id).limit(1000),
    client.from("surat_attachment_file_history").select("attachment_snapshot").eq("surat_id", token.surat_id).order("archived_at", { ascending: false }).limit(1000),
  ]);
  if ([jobResult, attachmentResult, historyResult].some(value => value.error || value.data?.length === 1000)) throw unavailable();
  // A revision may start while the metadata requests are in flight. Do not join
  // its new attachments to an older approval snapshot read before that revision.
  const confirmed = await publication();
  const fingerprint = (row: Document | null) => row && JSON.stringify({ ...row,
    surat_signatures: [...(row.surat_signatures || [])].sort((a, b) => a.id.localeCompare(b.id)),
  });
  if (confirmed.error || fingerprint(confirmed.data) !== fingerprint(result.data)) throw unavailable();
  return chooseExternalFileReference({ token, document: result.data, jobs: jobResult.data || [], attachments: attachmentResult.data || [],
    history: (historyResult.data || []).map((row: { attachment_snapshot: Attachment }) => row.attachment_snapshot), parseRef });
}
