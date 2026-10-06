export type Keu10Config = {
  version: 1;
  disposition: "legal_land" | "tactical_land" | "village_equipment";
  purposes: Array<{ code: string; label: string }>;
  approval_threshold: number | null;
};

export function normalizeKeu10Config(value: unknown): Keu10Config | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  if (config.version !== 1) return null;
  const disposition = config.disposition;
  if (disposition !== "legal_land" && disposition !== "tactical_land" && disposition !== "village_equipment") return null;
  const threshold = config.approval_threshold;
  if (disposition === "tactical_land" ? threshold !== 2_000_000 : threshold !== null) return null;
  if (!Array.isArray(config.purposes) || config.purposes.length === 0 || config.purposes.length > 50) return null;
  const purposes: Keu10Config["purposes"] = [];
  const codes = new Set<string>();
  for (const raw of config.purposes) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const purpose = raw as Record<string, unknown>;
    if (typeof purpose.code !== "string" || typeof purpose.label !== "string") return null;
    const code = purpose.code.trim();
    const label = purpose.label.trim();
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(code) || !label || label.length > 240 || codes.has(code)) return null;
    codes.add(code);
    purposes.push({ code, label });
  }
  return { version: 1, disposition, purposes, approval_threshold: typeof threshold === "number" ? threshold : null };
}
