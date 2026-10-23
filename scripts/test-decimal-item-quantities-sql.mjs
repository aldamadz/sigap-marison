import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = name => readFileSync(`supabase/migrations/${name}`, "utf8");
const functionDefinition = (source, name) => {
  const start = source.indexOf(`function public.${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf("$$;", start);
  assert.ok(end > start);
  return `create or replace ${source.slice(start, end + 3)}`;
};
const migration = read("20261023120000_decimal_item_quantities.sql");
const config = functionDefinition(read("20261006170000_keu10_canonical_workflow.sql"), "is_valid_keu10_config");
const oldKeu = functionDefinition(read("20261006183000_keu10_automatic_fund_type.sql"), "normalize_keu10_input");
const oldRec = functionDefinition(read("20260810143000_rec03_recommendation_multi_detail_foundation.sql"), "validate_recommendation_items");
const fixture = JSON.parse(readFileSync("fixtures/recommendation-multi-detail-v1.json", "utf8"));
fixture.items[0].applicant_original.quantity = 1.5;
fixture.items[0].details[0].quantity = 0.5;
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const sql = `
create role anon; create role authenticated; create role service_role;
${config}
${oldKeu}
${oldRec}
revoke all on function public.validate_recommendation_items(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.validate_recommendation_items(jsonb,boolean) to service_role;
create temp table acl_before as select oid,proacl from pg_proc where oid in
 ('public.validate_recommendation_items(jsonb,boolean)'::regprocedure,'public.normalize_keu10_input(jsonb,jsonb)'::regprocedure);
${migration}
${migration}
do $$
declare cfg jsonb := '{"version":1,"disposition":"legal_land","purposes":[{"code":"land","label":"Tanah"}],"approval_threshold":null}';
 input jsonb := '{"keu10_purpose_code":"land","items":[{"id":"a","keterangan":"Ukur","jumlah":"1,5","satuan":"m2","estimasi_harga_satuan":1001}]}';
 output jsonb; invalid text; rec jsonb := ${literal(fixture.items)}; before_rec jsonb;
begin
 if exists(select 1 from acl_before b join pg_proc p on p.oid=b.oid where p.proacl is distinct from b.proacl) then raise exception 'ACL changed'; end if;
 output := public.normalize_keu10_input(input,cfg);
 if output#>>'{items,0,jumlah}' <> '1.5' or output#>>'{items,0,total}' <> '1502' or output->>'fund_amount' <> '1502' then raise exception 'Decimal money mismatch'; end if;
 if public.normalize_keu10_input(output,cfg) <> output then raise exception 'Normalization not idempotent'; end if;
 before_rec := rec;
 perform public.validate_recommendation_items(rec,true);
 if rec <> before_rec then raise exception 'Audit fixture mutated'; end if;
 foreach invalid in array array['0','-1','0.0000001','NaN','Infinity','9007199254740992','1.2.3'] loop
  begin
   perform public.normalize_keu10_input(jsonb_set(input,'{items,0,jumlah}',to_jsonb(invalid)),cfg);
   raise exception 'Accepted invalid quantity: %', invalid using errcode='P0002';
  exception when sqlstate '22023' then null; end;
  begin
   perform public.validate_recommendation_items(jsonb_set(rec,'{0,details,0,quantity}',to_jsonb(invalid)),true);
   raise exception 'Accepted invalid recommendation quantity: %', invalid using errcode='P0002';
  exception when sqlstate '22023' then null; end;
 end loop;
 begin
  perform public.validate_recommendation_items(jsonb_set(rec,'{0,details,0,parent_item_id}','"foreign"'),true);
  raise exception 'Accepted foreign parent' using errcode='P0002';
 exception when sqlstate '22023' then null; end;
 raise notice 'Decimal item quantities: all assertions passed';
end $$;
`;
const name = `sigap-decimal-${process.pid}-${Date.now()}`;
const docker = (args, options = {}) => spawnSync("docker", args, { encoding: "utf8", ...options });
let started = false;
try {
  const start = docker(["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
  assert.equal(start.status, 0, start.stderr);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(["exec", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-Atc", "select 1"]).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Disposable PostgreSQL TCP server not ready");
  const result = docker(["exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Decimal item quantities: all assertions passed/);
  process.stdout.write(result.stderr);
} finally {
  if (started) {
    const removed = docker(["rm", "-f", name]);
    assert.equal(removed.status, 0, "Could not remove disposable test container");
  }
}
