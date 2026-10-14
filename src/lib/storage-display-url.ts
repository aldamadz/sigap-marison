export const migratedStorageDisplayUrl = (value: string | undefined, origins: string = import.meta.env.VITE_LEGACY_STORAGE_ORIGINS || "") => {
  if (!value || !origins || !value.startsWith("https://")) return value;
  try {
    const url = new URL(value);
    const allowed = origins.split(",").map((origin: string) => origin.trim()).filter(Boolean);
    if (url.username || url.password || !allowed.includes(url.origin)
      || !/^\/storage\/v1\/object\/public\/(?:avatars|lampiran_surat|dokumen_surat)\//.test(url.pathname)) return value;
    // Presentation only: saved references and immutable revision snapshots stay intact.
    return url.pathname + url.search;
  } catch {
    return value;
  }
};
