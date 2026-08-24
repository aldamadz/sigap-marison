import { supabase } from "@/lib/supabase";

export const SURAT_MONITORING_PAGE_SIZE = 24;

export type SuratMonitoringFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  dateRange?: "all" | "today" | "week" | "month";
};

export type SuratMonitoringPage = {
  rows: any[];
  count: number;
  page: number;
  pageSize: number;
};

export type SuratMonitoringStats = {
  total: number;
  selesai: number;
  proses: number;
  ditolak: number;
};

const normalizeSearch = (value?: string) =>
  String(value || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);

const dateBounds = (range: SuratMonitoringFilters["dateRange"]) => {
  if (!range || range === "all") return null;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 7);
  if (range === "month") start.setDate(1);
  const end = range === "today" ? new Date(start.getTime() + 86_400_000) : null;
  return { start: start.toISOString(), end: end?.toISOString() || null };
};

export const suratMonitoringService = {
  async getPage(filters: SuratMonitoringFilters = {}): Promise<SuratMonitoringPage> {
    const pageSize = Math.min(Math.max(filters.pageSize || SURAT_MONITORING_PAGE_SIZE, 1), 50);
    const page = Math.max(filters.page || 1, 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const search = normalizeSearch(filters.search);
    const bounds = dateBounds(filters.dateRange);
    const { data, error } = await supabase.rpc("get_surat_monitoring_page", {
      p_limit: pageSize,
      p_offset: from,
      p_search: search || null,
      p_status: filters.status || null,
      p_date_from: bounds?.start || null,
      p_date_to: bounds?.end || null,
    });
    if (error) throw error;
    const result = (data || {}) as { rows?: any[]; count?: number };
    return { rows: result.rows || [], count: Number(result.count || 0), page, pageSize };
  },

  async getDetail(id: string, signal?: AbortSignal) {
    let query = supabase.rpc("get_surat_monitoring_detail", {
      p_surat_id: id,
    });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    if (!data) throw new Error("Dokumen tidak ditemukan atau tidak dapat diakses.");
    return data;
  },

  async getMyStats(dateFrom?: Date, dateTo?: Date): Promise<SuratMonitoringStats> {
    const { data, error } = await supabase.rpc("get_my_surat_monitoring_stats", {
      p_date_from: dateFrom?.toISOString() || null,
      p_date_to: dateTo?.toISOString() || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      total: Number(row?.total || 0),
      selesai: Number(row?.selesai || 0),
      proses: Number(row?.proses || 0),
      ditolak: Number(row?.ditolak || 0),
    };
  },
};
