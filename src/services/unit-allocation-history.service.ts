import { supabase } from "@/lib/supabase";

export type UnitAllocationHistoryRow = {
  id: string;
  signature_id: string;
  actor_name: string;
  created_at: string;
  requested_count: number;
  allocated_count: number;
  remaining_count: number;
  note: string | null;
};

export const getUnitAllocationHistory = async (suratId: string): Promise<UnitAllocationHistoryRow[]> => {
  const rows: UnitAllocationHistoryRow[] = [];
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase.from("surat_unit_allocation_history")
      .select("id,signature_id,actor_name,created_at,requested_count,allocated_count,remaining_count,note")
      .eq("surat_id", suratId).order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(page * 100, page * 100 + 99);
    if (error) throw error;
    const batch = (data || []) as UnitAllocationHistoryRow[];
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  throw new Error("Riwayat pemeriksaan unit terlalu besar untuk dimuat lengkap.");
};
