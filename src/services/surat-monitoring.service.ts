import { supabase } from "@/lib/supabase";

export const SURAT_MONITORING_PAGE_SIZE = 24;

export type SuratMonitoringFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  dateRange?: "all" | "today" | "week" | "month";
  createdBy?: string;
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

const LIST_COLUMNS = `
  id, no_surat, judul_surat, status, current_step, created_at, updated_at,
  created_by, file_path, lampiran_path,
  surat_signatures (
    id, step_order, is_signed, status, role_name, label_jabatan, signed_at, catatan,
    profiles:user_id ( full_name, job_title )
  )
`;

const DETAIL_COLUMNS = `
  *,
  surat_signatures (
    *,
    profiles:user_id ( id, full_name, job_title, avatar_url )
  ),
  surat_attachments (
    id, file_url, file_name, file_type, file_size, stage,
    requirement_key, requirement_label, signature_id, created_at
  )
`;

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

const applyStatusFilter = (query: any, status?: string) => {
  if (!status || status === "all") return query;
  if (status === "SELESAI") return query.in("status", ["SELESAI", "DONE"]);
  if (status === "DITOLAK" || status === "REJECTED") return query.in("status", ["DITOLAK", "REJECTED"]);
  if (status === "PROSES") return query.in("status", ["PROSES", "PENDING", "IN_PROGRESS"]);
  return query.eq("status", status);
};

export const suratMonitoringService = {
  async getPage(filters: SuratMonitoringFilters = {}): Promise<SuratMonitoringPage> {
    const pageSize = Math.min(Math.max(filters.pageSize || SURAT_MONITORING_PAGE_SIZE, 1), 50);
    const page = Math.max(filters.page || 1, 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("surat_registrasi")
      .select(LIST_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.createdBy) query = query.eq("created_by", filters.createdBy);
    query = applyStatusFilter(query, filters.status);

    const search = normalizeSearch(filters.search);
    if (search) query = query.or(`judul_surat.ilike.%${search}%,no_surat.ilike.%${search}%`);

    const bounds = dateBounds(filters.dateRange);
    if (bounds) {
      query = query.gte("created_at", bounds.start);
      if (bounds.end) query = query.lt("created_at", bounds.end);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { rows: data || [], count: count || 0, page, pageSize };
  },

  async getDetail(id: string) {
    const { data, error } = await supabase
      .from("surat_registrasi")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
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
