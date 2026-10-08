import { supabase } from "@/lib/supabase";

export type RequesterFollowUpSla = {
  event_id: string;
  started_at: string;
  measured_at: string;
  elapsed_minutes: number;
  sla_minutes: number;
  department_name: string | null;
  config_source: "department" | "default";
  timezone: string;
};

const unavailable = () => new Error("SLA tindak lanjut tidak tersedia.");

export function getRequesterFollowUpSlaStatus(sla: RequesterFollowUpSla) {
  return {
    remainingMinutes: Math.max(0, sla.sla_minutes - sla.elapsed_minutes),
    lateMinutes: Math.max(0, sla.elapsed_minutes - sla.sla_minutes),
    isLate: sla.elapsed_minutes > sla.sla_minutes,
  };
}

export function formatFollowUpMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} jam${remainder ? ` ${remainder} menit` : ""}` : `${remainder} menit`;
}

export const requesterFollowUpSlaService = {
  async get(eventId: string): Promise<RequesterFollowUpSla | null> {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(eventId)) throw unavailable();
    const { data, error } = await supabase.rpc("get_requester_follow_up_sla", { p_event_id: eventId });
    if (error) throw unavailable();
    if (Array.isArray(data) && data.length === 0) return null;
    if (!Array.isArray(data) || data.length !== 1) throw unavailable();
    const row = data[0] as RequesterFollowUpSla;
    if (!row || row.event_id !== eventId
      || !Number.isInteger(row.elapsed_minutes) || row.elapsed_minutes < 0
      || !Number.isInteger(row.sla_minutes) || row.sla_minutes <= 0
      || typeof row.started_at !== "string" || !Number.isFinite(Date.parse(row.started_at))
      || typeof row.measured_at !== "string" || !Number.isFinite(Date.parse(row.measured_at))
      || (row.department_name !== null && typeof row.department_name !== "string")
      || !["department", "default"].includes(row.config_source)) throw unavailable();
    try {
      new Intl.DateTimeFormat("id-ID", { timeZone: row.timezone }).format();
      if (typeof row.timezone !== "string" || !row.timezone) throw unavailable();
    } catch {
      throw unavailable();
    }
    return row;
  },
};
