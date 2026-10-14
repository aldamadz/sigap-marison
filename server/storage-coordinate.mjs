const STORAGE_ROUTE = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

const safeDecode = (value) => {
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("Storage coordinate encoding is invalid.");
  }
  if (!decoded || decoded.includes("\\") || decoded.includes("\0")) throw new Error("Storage coordinate is invalid.");
  return decoded;
};

const cleanPart = (value, label) => {
  const decoded = safeDecode(String(value || ""));
  if (decoded.includes("/") || decoded === "." || decoded === "..") throw new Error(`${label} is invalid.`);
  return decoded;
};

const cleanObjectPath = (value) => {
  const parts = String(value || "").split("/").map((part) => cleanPart(part, "Storage object path"));
  if (parts.some((part) => !part)) throw new Error("Storage object path is invalid.");
  return parts.join("/");
};

export const normalizeLegacyStorageCoordinate = (value) => {
  const raw = String(value || "").trim();
  if (raw.startsWith("dokumen_surat/") || raw.startsWith("lampiran_surat/")) return raw;
  if (raw.startsWith("dokumen_")) return `dokumen_surat/${raw}`;
  if (raw.startsWith("lampiran_")) return `lampiran_surat/${raw}`;
  return raw;
};

export const configuredStorageOriginAliases = (value) => String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const url = new URL(entry);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Legacy storage origins must be bare HTTPS origins.");
  }
  return url.origin;
});

export const parseStorageCoordinate = (value, { origins, aliases = {}, defaultOrigin = "primary" } = {}) => {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Storage coordinate is required.");
  const knownOrigins = Object.fromEntries(Object.entries(origins || {}).map(([name, origin]) => [name, new URL(origin).origin]));
  const originEntries = Object.entries(knownOrigins).flatMap(([name, origin]) => [
    [name, origin], ...(aliases[name] || []).map((alias) => [name, new URL(alias).origin]),
  ]);

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.username || url.password) throw new Error("Storage URL credentials are not allowed.");
    const origin = originEntries.find(([, known]) => known === url.origin)?.[0];
    if (!origin) throw new Error("Storage URL origin is not recognized.");
    const match = url.pathname.match(STORAGE_ROUTE);
    if (!match) throw new Error("Storage URL path is invalid.");
    return Object.freeze({ origin, bucket: cleanPart(match[1], "Storage bucket"), objectPath: cleanObjectPath(match[2]) });
  }

  if (raw.includes("?") || raw.includes("#")) throw new Error("Bare storage coordinate cannot contain URL parameters.");
  const slash = raw.indexOf("/");
  if (slash < 1) throw new Error("Storage coordinate must contain bucket and object path.");
  if (knownOrigins[defaultOrigin] === undefined && Object.keys(knownOrigins).length > 0) throw new Error("Default storage origin is not recognized.");
  return Object.freeze({ origin: defaultOrigin, bucket: cleanPart(raw.slice(0, slash), "Storage bucket"), objectPath: cleanObjectPath(raw.slice(slash + 1)) });
};
