begin;

alter table public.file_view_tokens add column if not exists reference_kind text;
alter table public.file_view_tokens add column if not exists reference_attachment_id uuid;
alter table public.file_view_tokens add column if not exists reference_slot_singleton boolean not null default false;
alter table public.file_view_tokens drop constraint if exists file_view_token_logical_reference;
alter table public.file_view_tokens add constraint file_view_token_logical_reference check (
 (reference_kind is null and reference_attachment_id is null)
 or (purpose='external_marison' and reference_kind='main_pdf' and reference_attachment_id is null)
 or (purpose='external_marison' and reference_kind='attachment_pdf' and reference_attachment_id is not null)
);

-- The immutable sent main_document field is authoritative for legacy main links.
-- Only annotate their logical role; the original URL, coordinates and payload stay.
update public.file_view_tokens t set reference_kind='main_pdf'
from public.marison_outbound_dispatches d
where t.purpose='external_marison' and t.reference_kind is null and d.surat_id=t.surat_id
 and d.payload->>'main_document' ~ '^https://[^/?#]+/api/files/view/[A-Za-z0-9_-]{22,128}(/[^?#]*)?$'
 and t.token_hash=encode(extensions.digest(substring(d.payload->>'main_document' from '/api/files/view/([A-Za-z0-9_-]+)'),'sha256'),'hex');

create table if not exists public.surat_attachment_file_history (
 id uuid primary key default gen_random_uuid(),
 attachment_id uuid not null,
 surat_id uuid not null,
 attachment_snapshot jsonb not null,
 fingerprint text not null,
 archived_at timestamptz not null default clock_timestamp(),
 unique(attachment_id,fingerprint)
);
create index if not exists surat_attachment_file_history_document_idx on public.surat_attachment_file_history(surat_id,archived_at desc);
alter table public.surat_attachment_file_history enable row level security;
revoke all on public.surat_attachment_file_history from public,anon,authenticated,service_role;
grant select on public.surat_attachment_file_history to service_role;

-- Recover only metadata already retained in the canonical audit. Never recreate
-- missing bytes or modify the original outbound payload/capability coordinates.
insert into public.surat_attachment_file_history(attachment_id,surat_id,attachment_snapshot,fingerprint)
select a.id,a.surat_id,to_jsonb(a),md5(to_jsonb(a)::text) from public.surat_attachments a
where a.file_url is not null on conflict do nothing;
insert into public.surat_attachment_file_history(attachment_id,surat_id,attachment_snapshot,fingerprint)
select (a.old_values->>'id')::uuid,(a.old_values->>'surat_id')::uuid,a.old_values,md5(a.old_values::text)
from public.activity_logs a where a.table_name='surat_attachments'
 and a.old_values->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and a.old_values->>'surat_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and nullif(a.old_values->>'file_url','') is not null on conflict do nothing;

create or replace function public.archive_surat_attachment_file()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.file_url is distinct from old.file_url then
  insert into public.surat_attachment_file_history(attachment_id,surat_id,attachment_snapshot,fingerprint)
  values(old.id,old.surat_id,to_jsonb(old),md5(to_jsonb(old)::text)) on conflict do nothing;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists archive_surat_attachment_file on public.surat_attachments;
create trigger archive_surat_attachment_file before update or delete on public.surat_attachments
for each row execute function public.archive_surat_attachment_file();
create or replace function public.guard_attachment_file_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Arsip lampiran tidak dapat diubah atau dihapus.' using errcode='42501'; end $$;
drop trigger if exists guard_attachment_file_history on public.surat_attachment_file_history;
create trigger guard_attachment_file_history before update or delete on public.surat_attachment_file_history
for each row execute function public.guard_attachment_file_history();
revoke all on function public.archive_surat_attachment_file(),public.guard_attachment_file_history() from public,anon,authenticated,service_role;

-- Metadata replacement is atomic. A one-file slot keeps its stable attachment ID;
-- old bytes remain in storage and the trigger captures the previous metadata.
create or replace function public.replace_signature_attachment_metadata(
 p_actor uuid,p_surat uuid,p_signature uuid,p_stage text,p_expected jsonb,p_files jsonb
) returns setof public.surat_attachments
language plpgsql security definer set search_path='' as $$
declare v_sig public.surat_signatures%rowtype;v_keys text[];v_key text;v_old uuid;v_file jsonb;v_count integer;v_expected integer;
begin
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files)<1 or jsonb_array_length(p_files)>50
  or jsonb_typeof(p_expected) is distinct from 'array' or p_stage not in ('approval','unit_allocation') then
  raise exception 'Invalid replacement metadata' using errcode='22023'; end if;
 select * into strict v_sig from public.surat_signatures where id=p_signature and surat_id=p_surat for update;
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.is_active is true and p.deleted_at is null
   and (p.role::text='admin' or v_sig.user_id=p_actor or v_sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',p_actor::text)))) then
  raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements(p_files) f where f->>'surat_id' is distinct from p_surat::text
  or f->>'signature_id' is distinct from p_signature::text or f->>'stage' is distinct from p_stage
  or f->>'created_by' is distinct from p_actor::text or nullif(trim(f->>'requirement_key'),'') is null
  or coalesce(f->>'file_url','') !~ '^https://' or coalesce(f->>'file_size','') !~ '^[0-9]+$') then
  raise exception 'Replacement context mismatch' using errcode='22023'; end if;
 select array_agg(distinct f->>'requirement_key') into v_keys from jsonb_array_elements(p_files) f;
 perform 1 from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key=any(v_keys) for update;
 select count(*) into v_count from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key=any(v_keys);
 v_expected:=jsonb_array_length(p_expected);
 if v_count<>v_expected or exists(select 1 from jsonb_array_elements(p_expected) e where not exists(
  select 1 from public.surat_attachments a where a.id::text=e->>'id' and a.surat_id=p_surat and a.signature_id=p_signature
   and a.stage=p_stage and a.requirement_key=any(v_keys) and a.file_url=e->>'file_url' and a.requirement_key=e->>'requirement_key')) then
  raise exception 'Attachment changed; reload before replacing' using errcode='40001'; end if;
 if (select count(*) from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key='verifier_additional')
  +(select count(*) from jsonb_array_elements(p_files) f where f->>'requirement_key'='verifier_additional')>5 then
  raise exception 'Maksimal 5 lampiran tambahan pemeriksaan.' using errcode='22023'; end if;
 foreach v_key in array v_keys loop
  v_old:=null;
  if v_key<>'verifier_additional' and (select count(*) from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key=v_key)=1
   and (select count(*) from jsonb_array_elements(p_files) f where f->>'requirement_key'=v_key)=1 then
   select id into v_old from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key=v_key;
  elsif v_key<>'verifier_additional' then
   delete from public.surat_attachments where surat_id=p_surat and signature_id=p_signature and stage=p_stage and requirement_key=v_key;
  end if;
  for v_file in select f from jsonb_array_elements(p_files) f where f->>'requirement_key'=v_key loop
   if v_old is not null then
    return query update public.surat_attachments set file_url=v_file->>'file_url',file_name=v_file->>'file_name',file_type=v_file->>'file_type',
     file_size=(v_file->>'file_size')::bigint,created_by=p_actor,created_at=clock_timestamp(),requirement_label=v_file->>'requirement_label'
     where id=v_old returning *;
   else
    return query insert into public.surat_attachments(surat_id,signature_id,stage,requirement_key,requirement_label,file_url,file_name,file_type,file_size,created_by)
     values(p_surat,p_signature,p_stage,v_key,v_file->>'requirement_label',v_file->>'file_url',v_file->>'file_name',v_file->>'file_type',(v_file->>'file_size')::bigint,p_actor) returning *;
   end if;
  end loop;
 end loop;
end $$;
revoke all on function public.replace_signature_attachment_metadata(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.replace_signature_attachment_metadata(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;

-- Only the already-dynamic recommendation purpose changes: resolve its current
-- canonical, fingerprint-validated publication rather than rejecting an old URL.
create or replace function public.consume_file_view_token(p_token_hash text)
returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text)
language plpgsql security definer set search_path='' as $$
declare v public.file_view_tokens%rowtype;
begin
 select * into v from public.file_view_tokens f where f.token_hash=p_token_hash and f.revoked_at is null
  and (f.expires_at is null or f.expires_at>now())
  and (f.consumed_at is null or f.purpose in ('email','external_marison','external_marison_recommendation_pdf')) for update;
 if not found then return; end if;
 if v.purpose='external_marison_recommendation_pdf' then
  select s.pdf_bucket,s.pdf_object_path,s.pdf_storage_origin into bucket,object_path,storage_origin
  from public.surat_linked_documents l join public.surat_registrasi s on s.id=l.child_surat_id
  where s.id=v.surat_id and l.link_type='recommendation' and l.status='active' and public.recommendation_pdf_is_current(s.id)
  order by l.updated_at desc,l.id desc limit 1 for share of l,s;
  if not found or bucket is null or object_path is null or storage_origin is null then return; end if;
  update public.file_view_tokens set last_accessed_at=clock_timestamp() where id=v.id;
  insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action)
   values(v.id,v.token_hash,v.surat_id,v.purpose,'resolved');
 else
  bucket:=v.bucket;object_path:=v.object_path;storage_origin:=v.storage_origin;
  if v.purpose not in ('email','external_marison') then update public.file_view_tokens set consumed_at=clock_timestamp() where id=v.id; end if;
 end if;
 token_id:=v.id;surat_id:=v.surat_id;return next;
end $$;
revoke all on function public.consume_file_view_token(text) from public,anon,authenticated;
grant execute on function public.consume_file_view_token(text) to service_role;
notify pgrst,'reload schema';
commit;
