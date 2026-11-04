import { Input } from "@/components/ui/input";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export function UnitLandAreaField({ unit, label }: { unit: unknown; label: string }) {
  const option = record(unit);
  const external = Object.prototype.hasOwnProperty.call(option, "raw") ? record(option.raw) : option;
  const area = external.land_area ?? external.luas_tanah ?? external.lt;
  const text = typeof area === "number" || typeof area === "string" ? String(area).trim() : "";
  const value = /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text)) ? text : "";

  return (
    <Input
      value={value}
      disabled
      readOnly
      aria-label={`LT (Luas Tanah) kavling ${label}`}
      placeholder="Belum tersedia di external"
      className="h-11 text-sm"
      style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))", opacity: 1 }}
    />
  );
}
