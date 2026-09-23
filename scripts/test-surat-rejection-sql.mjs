import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const migration = readFileSync(
  "supabase/migrations/20260818153000_reject_surat_by_document_number.sql",
  "utf8",
);

const fixture = `
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable set search_path = '' as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles(
  id uuid primary key,
  is_active boolean not null default true,
  deleted_at timestamptz
);
create table public.surat_registrasi(
  id uuid primary key,
  created_by uuid references public.profiles(id),
  no_surat text,
  judul_surat text,
  status text,
  current_step integer,
  updated_at timestamptz default now()
);
create table public.surat_signatures(
  id uuid primary key,
  surat_id uuid references public.surat_registrasi(id),
  user_id uuid references public.profiles(id),
  step_order integer,
  is_signed boolean default false,
  signed_at timestamptz,
  catatan text,
  status text,
  verification_required boolean default false,
  verification_status text default 'not_required'
);
create table public.notifications(
  id bigint generated always as identity primary key,
  user_id uuid,
  type text,
  title text,
  message text,
  data jsonb,
  link text
);
create table public.activity_logs(
  id bigint generated always as identity primary key,
  user_id uuid,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb
);
grant select on public.surat_registrasi, public.surat_signatures, public.notifications, public.activity_logs to authenticated;
create function public.test_audit_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.activity_logs(user_id,table_name,record_id,old_values,new_values)
  values(auth.uid(),tg_table_name,new.id::text,to_jsonb(old),to_jsonb(new));
  return new;
end$$;
create trigger audit_surat after update on public.surat_registrasi for each row execute function public.test_audit_change();
create trigger audit_signature after update on public.surat_signatures for each row execute function public.test_audit_change();

create function public.handle_reject_surat_v2(p_sig_id uuid,p_surat_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_current integer;v_step integer;v_required boolean;v_verified text;
begin
  if v_actor is null then raise exception 'Tidak terautentikasi';end if;
  if nullif(btrim(p_note),'') is null then raise exception 'Catatan penolakan wajib diisi';end if;
  select current_step into v_current from public.surat_registrasi where id=p_surat_id and status='PROSES' for update;
  if not found then raise exception 'Surat tidak ditemukan atau sudah selesai';end if;
  select step_order,verification_required,verification_status into v_step,v_required,v_verified
  from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id and user_id=v_actor and is_signed=false for update;
  if not found then raise exception 'Tanda tangan tidak tersedia untuk user ini';end if;
  if v_step<>v_current then raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';end if;
  if v_required and v_verified<>'verified' then raise exception 'Data pengajuan belum diverifikasi tim pengecek';end if;
  update public.surat_signatures set is_signed=true,signed_at=clock_timestamp(),catatan=p_note,status='REJECTED' where id=p_sig_id;
  update public.surat_registrasi set status='REJECTED',updated_at=clock_timestamp() where id=p_surat_id;
  return true;
end$$;
grant execute on function public.handle_reject_surat_v2(uuid,uuid,text) to authenticated;

${migration}

begin;
insert into public.profiles(id,is_active) values
 ('10000000-0000-4000-8000-000000000001',true),
 ('10000000-0000-4000-8000-000000000002',true),
 ('10000000-0000-4000-8000-000000000003',true),
 ('10000000-0000-4000-8000-000000000004',false);
insert into public.surat_registrasi(id,created_by,no_surat,judul_surat,status,current_step) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','DOC-REJECT-001','Pengajuan uji','PROSES',1),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','DOC-DUPLICATE','Duplikat A','PROSES',1),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','DOC-DUPLICATE','Duplikat B','PROSES',1);
insert into public.surat_signatures(id,surat_id,user_id,step_order) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',1),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',2);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$declare v_result jsonb;begin
  v_result:=public.reject_surat_by_document_number(' DOC-REJECT-001 ','Anggaran belum tersedia','Ajukan ulang bulan depan');
  if v_result#>>'{idempotent}'<>'false' then raise exception 'first rejection was not new';end if;
  if not exists(select 1 from public.surat_registrasi where no_surat='DOC-REJECT-001' and status='REJECTED') then raise exception 'document not rejected';end if;
  if not exists(select 1 from public.surat_signatures where id='30000000-0000-4000-8000-000000000001' and status='REJECTED' and catatan=E'Anggaran belum tersedia\n\nCatatan: Ajukan ulang bulan depan') then raise exception 'signature rejection not persisted';end if;
  if (select count(*) from public.notifications where data->>'event_type'='document_rejected_by_number')<>1 then raise exception 'notification count invalid';end if;
  if (select count(*) from public.activity_logs where record_id in('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'))<>2 then raise exception 'audit update count invalid';end if;

  v_result:=public.reject_surat_by_document_number('DOC-REJECT-001','Anggaran belum tersedia','Ajukan ulang bulan depan');
  if v_result#>>'{idempotent}'<>'true' then raise exception 'identical replay not idempotent';end if;
  if (select count(*) from public.notifications where data->>'event_type'='document_rejected_by_number')<>1 then raise exception 'replay duplicated notification';end if;

  begin perform public.reject_surat_by_document_number('DOC-REJECT-001','Alasan berbeda',null);raise exception 'different replay accepted';exception when sqlstate '55000' then null;end;
  begin perform public.reject_surat_by_document_number('DOC-DUPLICATE','x',null);raise exception 'duplicate reference accepted';exception when sqlstate '21000' then null;end;
  begin perform public.reject_surat_by_document_number('DOC-NOT-FOUND','x',null);raise exception 'missing reference accepted';exception when sqlstate 'P0002' then null;end;
  begin perform public.reject_surat_by_document_number('DOC-REJECT-001','',null);raise exception 'blank reason accepted';exception when sqlstate '22023' then null;end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin
  begin perform public.reject_surat_by_document_number('DOC-REJECT-001','x',null);raise exception 'non-active signer replay accepted';exception when sqlstate 'P0002' then null;end;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$begin
  begin perform public.reject_surat_by_document_number('DOC-REJECT-001','x',null);raise exception 'inactive profile accepted';exception when sqlstate '42501' then null;end;
end$$;
rollback;
select 'ALL SURAT REJECTION SQL TESTS PASSED' as result;
`;

const run = (args, input = "") => {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${result.stderr || ""}\n${result.stdout || ""}`.trim());
  return result.stdout;
};

const containerId = run(["run", "-d", "-e", "POSTGRES_PASSWORD=test", "postgres:17-alpine"]).trim();
try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = spawnSync("docker", ["exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { encoding: "utf8" }).status === 0;
    if (!ready) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  process.stdout.write(run(["exec", "-i", containerId, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], fixture));
} finally {
  run(["rm", "-f", containerId]);
}
