import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync("supabase/migrations/20261022090000_latest_external_pdf_links.sql", "utf8");
const fixture = `
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon; create role authenticated; create role service_role bypassrls;
create table public.profiles(id uuid primary key,role text,is_active boolean,deleted_at timestamptz);
create table public.surat_registrasi(id uuid primary key,pdf_bucket text,pdf_object_path text,pdf_storage_origin text);
create table public.surat_signatures(id uuid primary key,surat_id uuid,user_id uuid,verifier_snapshot jsonb);
create table public.surat_attachments(id uuid primary key default gen_random_uuid(),surat_id uuid,signature_id uuid,stage text,requirement_key text,requirement_label text,file_url text,file_name text,file_type text,file_size bigint,created_by uuid,created_at timestamptz default now());
create table public.activity_logs(table_name text,old_values jsonb);
create table public.marison_outbound_dispatches(id uuid primary key,surat_id uuid,payload jsonb);
create table public.surat_linked_documents(id uuid primary key default gen_random_uuid(),child_surat_id uuid,link_type text,status text,updated_at timestamptz default now());
create table public.file_view_tokens(id uuid primary key default gen_random_uuid(),token_hash text not null unique,bucket text,object_path text,storage_origin text,surat_id uuid,purpose text,expires_at timestamptz,revoked_at timestamptz,consumed_at timestamptz,last_accessed_at timestamptz);
create table public.file_view_token_audit(token_id uuid,token_hash text,surat_id uuid,purpose text,action text);
create function public.recommendation_pdf_is_current(uuid) returns boolean language sql stable as $$select true$$;
create function public.consume_file_view_token(text) returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text) language sql as $$select null::uuid,null::uuid,null::text,null::text,null::text where false$$;
insert into profiles values('00000000-0000-0000-0000-000000000001','user',true,null),('00000000-0000-0000-0000-000000000002','user',true,null);
insert into surat_registrasi values('10000000-0000-0000-0000-000000000001','dokumen_surat','new.pdf','external');
insert into surat_signatures values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','[]');
insert into surat_attachments(id,surat_id,signature_id,stage,requirement_key,file_url,file_name,file_type,file_size,created_by)
values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approval','rab','https://storage/old.pdf','rab.pdf','application/pdf',10,'00000000-0000-0000-0000-000000000001');
insert into file_view_tokens(token_hash,bucket,object_path,storage_origin,surat_id,purpose)
values(encode(extensions.digest(repeat('x',32),'sha256'),'hex'),'dokumen_surat','old.pdf','external','10000000-0000-0000-0000-000000000001','external_marison');
insert into marison_outbound_dispatches values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001',jsonb_build_object('main_document','https://sigap.example/api/files/view/'||repeat('x',32)||'/doc.pdf'));
create temp table frozen_dispatch as select md5(string_agg(to_jsonb(d)::text,'' order by id)) digest from marison_outbound_dispatches d;
`;
const assertions = `
do $$declare v_old jsonb;v_file jsonb;v_id uuid;v_count int;begin
 if (select count(*) from file_view_tokens where reference_kind='main_pdf' and object_path='old.pdf')<>1 then raise exception 'legacy main reference missing';end if;
 if (select digest from frozen_dispatch)<>(select md5(string_agg(to_jsonb(d)::text,'' order by id)) from marison_outbound_dispatches d) then raise exception 'dispatch changed';end if;
 if has_table_privilege('anon','public.surat_attachment_file_history','SELECT') or has_table_privilege('authenticated','public.surat_attachment_file_history','SELECT') or has_table_privilege('service_role','public.surat_attachment_file_history','DELETE') then raise exception 'archive grants too broad';end if;
 if not has_table_privilege('service_role','public.surat_attachment_file_history','SELECT') then raise exception 'archive unreadable';end if;
 if has_function_privilege('authenticated','public.replace_signature_attachment_metadata(uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE') then raise exception 'public replacement allowed';end if;
 select jsonb_agg(jsonb_build_object('id',id,'file_url',file_url,'requirement_key',requirement_key)) into v_old from surat_attachments;
 select to_jsonb(a)-'id'-'created_at' into v_file from surat_attachments a;
 v_file:=jsonb_set(v_file,'{file_url}','"https://storage/new.pdf"');
 begin
  perform public.replace_signature_attachment_metadata('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approval',v_old,jsonb_build_array(v_file));
  raise exception 'foreign actor accepted';
 exception when insufficient_privilege then null;end;
 select id into v_id from public.replace_signature_attachment_metadata('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approval',v_old,jsonb_build_array(v_file));
 if v_id<>'30000000-0000-0000-0000-000000000001' or not exists(select 1 from surat_attachment_file_history where attachment_id=v_id and attachment_snapshot->>'file_url'='https://storage/old.pdf') then raise exception 'identity/archive lost';end if;
 begin
  perform public.replace_signature_attachment_metadata('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','approval',v_old,jsonb_build_array(v_file));
  raise exception 'stale replacement accepted';
 exception when serialization_failure then null;end;
 begin delete from surat_attachment_file_history;raise exception 'archive deleted';exception when insufficient_privilege then null;end;
 delete from surat_attachments where id=v_id;
 if not exists(select 1 from surat_attachment_file_history where attachment_id=v_id and attachment_snapshot->>'file_url'='https://storage/new.pdf') then raise exception 'delete history missing';end if;
end $$;
insert into surat_linked_documents(child_surat_id,link_type,status) values('10000000-0000-0000-0000-000000000001','recommendation','active');
insert into file_view_tokens(token_hash,bucket,object_path,storage_origin,surat_id,purpose) values
('rec','dokumen_surat','old.pdf','external','10000000-0000-0000-0000-000000000001','external_marison_recommendation_pdf'),
('preview','dokumen_surat','old.pdf','external','10000000-0000-0000-0000-000000000001','preview'),
('expired','dokumen_surat','old.pdf','external','10000000-0000-0000-0000-000000000001','external_marison'),
('revoked','dokumen_surat','old.pdf','external','10000000-0000-0000-0000-000000000001','external_marison');
update file_view_tokens set expires_at=now()-interval '1 second' where token_hash='expired';
update file_view_tokens set revoked_at=now() where token_hash='revoked';
do $$declare r record;begin
 select * into r from consume_file_view_token('rec');if r.object_path is distinct from 'new.pdf' then raise exception 'recommendation stale';end if;
 if not exists(select 1 from consume_file_view_token('rec')) then raise exception 'external link became single-use';end if;
 select * into r from consume_file_view_token('preview');if r.object_path is distinct from 'old.pdf' then raise exception 'preview moved';end if;
 if exists(select 1 from consume_file_view_token('preview')) then raise exception 'preview reused';end if;
 if exists(select 1 from consume_file_view_token('expired')) or exists(select 1 from consume_file_view_token('revoked')) then raise exception 'revocation bypass';end if;
 if (select digest from frozen_dispatch)<>(select md5(string_agg(to_jsonb(d)::text,'' order by id)) from marison_outbound_dispatches d) then raise exception 'dispatch changed';end if;
 raise notice 'Latest external PDF: all assertions passed';
end $$;
`;
function run(args, input = "") {
  const r = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120000 });
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return args.includes("psql") ? r.stdout + r.stderr : r.stdout;
}
const id = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let n = 0; n < 40; n++) {
    ready = spawnSync("docker", ["exec", id, "pg_isready", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (ready) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Postgres not ready");
  process.stdout.write(run(["exec", "-i", id, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], fixture + migration + migration + assertions));
} finally { run(["rm", "-f", id]); }
