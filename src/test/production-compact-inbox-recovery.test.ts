import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260924090000_restore_production_compact_inbox.sql",
  "utf8",
);

describe("production compact inbox recovery", () => {
  it("restores the eight-argument RPC used by the BFF", () => {
    expect(migration).toMatch(/create or replace function public\.get_compact_inbox\(\s*p_user_id uuid,\s*p_limit integer default 20,\s*p_cursor_at timestamptz default null,\s*p_cursor_task_type text default null,\s*p_cursor_id uuid default null,\s*p_search text default null,\s*p_request_category text default null,\s*p_task_type text default null\s*\)/i);
    expect(migration).toContain("returns setof public.compact_inbox_item");
    expect(migration).toContain("union all");
  });

  it("keeps the production count implementation and restricts execution", () => {
    expect(migration).not.toMatch(/create or replace function public\.get_compact_inbox_count\s*\(/i);
    expect(migration).toMatch(/revoke execute on function public\.get_compact_inbox\([^)]+\) from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.get_compact_inbox\([^)]+\) to service_role/i);
    expect(migration).toMatch(/revoke execute on function public\.is_inbox_task_active\(uuid, uuid\) from public, anon, authenticated/i);
    expect(migration).not.toMatch(/^\s*commit\s*;/im);
  });
});
