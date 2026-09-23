export type FeatureAvailability = "enabled" | "disabled";

const normalizeAvailability = (value: unknown): FeatureAvailability =>
  String(value ?? "").trim().toLowerCase() === "false" ? "disabled" : "enabled";

export const resolveWorkCalendarAvailability = (value: unknown): FeatureAvailability =>
  normalizeAvailability(value);

export const workCalendarAvailability = resolveWorkCalendarAvailability(
  import.meta.env.VITE_WORK_CALENDAR_ENABLED,
);

export const isWorkCalendarEnabled = workCalendarAvailability === "enabled";
