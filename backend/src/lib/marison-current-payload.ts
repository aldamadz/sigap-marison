import { createHash } from "node:crypto";

type Ref = { origin?: string | null; bucket: string; path: string };
type Change = { path: string; before: unknown; after: unknown; removed: boolean; added: boolean };
const fail = (message: string) => Object.assign(new Error(message), { status: 409 });
const key = (ref: Ref) => JSON.stringify([ref.origin || "primary", ref.bucket, ref.path]);

export function storedCapabilityLinks(payload: unknown, appUrl: string) {
  const origin = new URL(appUrl).origin;
  const links = new Map<string, string>();
  function walk(value: unknown, depth = 0) {
    if (depth > 32) throw fail("Struktur payload terlalu dalam.");
    if (typeof value === "string") {
      let url: URL;
      try { url = new URL(value); } catch { return; }
      const match = url.pathname.match(/^\/api\/files\/view\/([A-Za-z0-9_-]{22,128})(?:\/[^?#]*)?$/);
      if (url.origin === origin && !url.username && !url.password && !url.search && !url.hash && match) {
        links.set(createHash("sha256").update(match[1]).digest("hex"), value);
        if (links.size > 256) throw fail("Terlalu banyak tautan untuk preview payload.");
      }
    } else if (Array.isArray(value)) value.forEach(item => walk(item, depth + 1));
    else if (value && typeof value === "object") Object.values(value).forEach(item => walk(item, depth + 1));
  }
  walk(payload);
  return links;
}

export function reusableCurrentFileLinks(entries: { url: string; suratId: string; ref: Ref; purpose: string }[], suratId: string, parseRef: (value: string) => Ref | null) {
  return async (rawPath: string) => {
    const requested = parseRef(rawPath);
    const found = requested && entries.find(entry => entry.suratId === suratId && entry.purpose === "external_marison" && key(entry.ref) === key(requested));
    if (!found) throw fail("Tautan external aktif untuk salah satu dokumen terbaru belum tersedia. Preview tidak membuat tautan atau pengiriman baru.");
    return found.url;
  };
}

export function compareCurrentPayload(before: unknown, after: unknown): Change[] {
  const changes: Change[] = [];
  const walk = (left: unknown, right: unknown, path: string, hasLeft = true, hasRight = true, depth = 0) => {
    if (depth > 32 || changes.length >= 2000) throw fail("Perubahan payload terlalu besar untuk ditampilkan.");
    if (hasLeft === hasRight && JSON.stringify(left) === JSON.stringify(right)) return;
    const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object";
    if (hasLeft && hasRight && object(left) && object(right) && Array.isArray(left) === Array.isArray(right)) {
      for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) {
        walk(left[field], right[field], Array.isArray(right) ? `${path}[${field}]` : path ? `${path}.${field}` : field,
          Object.hasOwn(left, field), Object.hasOwn(right, field), depth + 1);
      }
    } else changes.push({ path: path || "$", before: hasLeft ? left : null, after: hasRight ? right : null, removed: !hasRight, added: !hasLeft });
  };
  walk(before, after, "");
  return changes;
}

export function currentPayloadPreview(stored: { endpoint: string | null; payload: unknown; payloadHash: string | null; redacted: boolean }, dispatch: { endpoint: string; kind: string; payload: Record<string, unknown> }, kind: string, updatedAt: string | null, now = new Date()) {
  if (dispatch.kind !== kind || dispatch.endpoint !== stored.endpoint) throw fail("Kategori atau endpoint pengajuan berubah. Periksa konfigurasi sebelum melanjutkan.");
  if (stored.redacted) throw fail("Payload historis tidak lengkap untuk perbandingan.");
  const body = JSON.stringify(dispatch.payload);
  if (Buffer.byteLength(body, "utf8") > 2_000_000) throw fail("Payload terbaru terlalu besar.");
  return {
    source: "latest" as const, payload: dispatch.payload, payloadHash: createHash("sha256").update(body).digest("hex"),
    sourcePayloadHash: stored.payloadHash, generatedAt: now.toISOString(), sourceSuratUpdatedAt: updatedAt,
    fieldChanges: compareCurrentPayload(stored.payload, dispatch.payload),
    validation: "passed" as const,
  };
}
