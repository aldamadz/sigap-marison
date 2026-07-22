const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export const normalizeStoragePath = (value) => {
  const segments = String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Path storage tidak boleh mengandung traversal directory.");
  }

  return segments
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]+/g, "_"))
    .filter(Boolean)
    .join("/");
};

export const normalizeStoragePathPrefix = (value) => {
  const prefix = normalizeStoragePath(value);
  if (!prefix) return "";

  const segments = prefix.split("/");
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error("STORAGE_PATH_PREFIX tidak valid.");
  }
  return prefix;
};

export const applyStoragePathPrefix = (value, rawPrefix) => {
  const path = normalizeStoragePath(value);
  const prefix = normalizeStoragePathPrefix(rawPrefix);
  if (!path || !prefix) return path;
  if (path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}/${path}`;
};

export const isStoragePathWithinPrefix = (value, rawPrefix) => {
  const path = normalizeStoragePath(value);
  const prefix = normalizeStoragePathPrefix(rawPrefix);
  if (!prefix) return true;
  return path === prefix || path.startsWith(`${prefix}/`);
};

export const removeStoragePathPrefix = (value, rawPrefix) => {
  const path = normalizeStoragePath(value);
  const prefix = normalizeStoragePathPrefix(rawPrefix);
  if (!prefix) return path;
  if (!isStoragePathWithinPrefix(path, prefix)) {
    throw new Error("Path storage berada di luar namespace environment.");
  }
  return path === prefix ? "" : path.slice(prefix.length + 1);
};
