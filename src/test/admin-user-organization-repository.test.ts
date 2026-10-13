import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseProfileRepositoryPort } from "../../backend/src/modules/admin-user/admin-user-runtime.js";

const ID = "44444444-4444-4444-8444-444444444444";
let clientIndex = 0;
const cases = [
  { table: "master_departments", select: "id,name", row: { id: ID, name: "Pengembangan Organisasi" } },
  { table: "master_offices", select: "id,name,kedudukan", row: { id: ID, name: "Kantor Pusat", kedudukan: "Pusat" } },
];

function repositoryFor(responseRows: unknown[], table: string, status = 200) {
  const requests: URL[] = [];
  const client = createClient("https://organization.test", "test-key", {
    auth: { storageKey: `organization-test-${++clientIndex}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push(url);
        expect(url.pathname).toBe(`/rest/v1/${table}`);
        // Mirror the actual master schemas, not invented activity fields.
        const columns = table === "master_departments" ? ["id", "name"] : ["id", "name", "kedudukan"];
        const invalid = (url.searchParams.get("select") ?? "").split(",").find(column => !columns.includes(column));
        if (invalid) return new Response(JSON.stringify({ code: "42703", message: `column ${table}.${invalid} does not exist` }), { status: 400 });
        return new Response(JSON.stringify(status === 200 ? responseRows : { code: "42501", message: "Access denied" }), {
          status, headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return { repository: createSupabaseProfileRepositoryPort(client), requests };
}

describe.each(cases)("admin organization adapter: $table", ({ table, select, row }) => {
  it("queries only canonical columns and scopes the exact id", async () => {
    const { repository, requests } = repositoryFor([row], table);
    const result = table === "master_departments"
      ? await repository.findDepartmentById(ID) : await repository.findOfficeById(ID);
    expect(result).toEqual(row);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get("select")).toBe(select);
    expect(requests[0].searchParams.get("id")).toBe(`eq.${ID}`);
  });

  it("returns null for a missing reference", async () => {
    const { repository } = repositoryFor([], table);
    const result = table === "master_departments"
      ? await repository.findDepartmentById(ID) : await repository.findOfficeById(ID);
    expect(result).toBeNull();
  });

  it("propagates database authorization errors instead of accepting the reference", async () => {
    const { repository } = repositoryFor([], table, 403);
    const pending = table === "master_departments"
      ? repository.findDepartmentById(ID) : repository.findOfficeById(ID);
    await expect(pending).rejects.toMatchObject({ code: "42501" });
  });
});
