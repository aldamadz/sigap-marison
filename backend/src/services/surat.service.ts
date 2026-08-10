import { createUserSupabaseClient } from "../lib/supabase.js";

type QueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

const assertQuery = (label: string, result: QueryResult) => {
  if (result.error) {
    const error = new Error(`Gagal memuat ${label}: ${result.error.message || "query gagal"}`) as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
  return result.data || [];
};

export const loadSuratMasterData = async (accessToken: string) => {
  const client = createUserSupabaseClient(accessToken);
  const results = await Promise.all([
    client.from("master_entities").select("*"),
    client.from("master_offices").select("*"),
    client.from("master_departments").select("*"),
    client.from("master_letter_types").select("*"),
    client.from("master_dept_letter_types").select("dept_id, letter_type_id, sort_index"),
    client.from("profiles").select("id, full_name, job_title, department_id, office_id").eq("is_active", true).order("full_name"),
    client.from("master_projects").select("*").order("name"),
    client.from("master_penggunaan_detail").select("*").order("created_at", { ascending: false }),
  ]);

  return {
    entities: assertQuery("entitas", results[0] as QueryResult),
    offices: assertQuery("kantor", results[1] as QueryResult),
    departments: assertQuery("departemen", results[2] as QueryResult),
    letterTypes: assertQuery("jenis dokumen", results[3] as QueryResult),
    departmentLetterTypes: assertQuery("relasi jenis dokumen", results[4] as QueryResult),
    users: assertQuery("pengguna", results[5] as QueryResult),
    projects: assertQuery("proyek", results[6] as QueryResult),
    usages: assertQuery("kegunaan form", results[7] as QueryResult),
  };
};
