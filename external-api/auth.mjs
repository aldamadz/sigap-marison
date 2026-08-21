import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

const hmacSha512Hex = (secret, value) => createHmac("sha512", secret).update(value).digest("hex");

const safeHexEqual = (left, right) => {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

export const isRfc3339 = (value) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(String(value || ""));

export const buildRequestSignatureCanonical = ({ method, pathWithQuery, accessToken, rawBody, timestamp }) => {
  const bodyHash = sha256Hex(rawBody ?? Buffer.alloc(0));
  return [String(method || "").toUpperCase(), pathWithQuery, accessToken, bodyHash, timestamp].join(":");
};

export const createRequestSignature = (accessToken, input) =>
  hmacSha512Hex(accessToken, buildRequestSignatureCanonical({ ...input, accessToken }));

export const verifyRequestSignature = (provided, accessToken, input) =>
  safeHexEqual(createRequestSignature(accessToken, input), String(provided || "").trim().toLowerCase());

export const verifyScryptSecret = (secret, encoded) => {
  const [algorithm, nRaw, rRaw, pRaw, saltHex, keyHex] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![n, r, p].every(Number.isFinite)) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(String(secret || ""), Buffer.from(saltHex, "hex"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
