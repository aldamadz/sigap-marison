-- REC-03 PR117 blockers: canonical PDF pointers and attempt-owned links.
alter table public.surat_registrasi add column if not exists pdf_bucket text;
alter table public.surat_registrasi add column if not exists pdf_object_path text;
alter table public.surat_registrasi add column if not exists pdf_storage_origin text;
alter table public.document_pdf_jobs add column if not exists pdf_bucket text;
alter table public.document_pdf_jobs add column if not exists pdf_object_path text;
alter table public.document_pdf_jobs add column if not exists pdf_storage_origin text;
alter table public.file_view_tokens add column if not exists transport_attempt_id uuid;
alter table public.file_view_tokens add column if not exists dispatch_id uuid references public.marison_outbound_dispatches(id);
alter table public.file_view_tokens add column if not exists dispatch_lease_token uuid;
alter table public.file_view_tokens add column if not exists minted_at timestamptz not null default clock_timestamp();
alter table public.file_view_tokens add column if not exists mint_status text generated always as (case when revoked_at is null then 'minted' else 'revoked' end) stored;

alter table public.surat_registrasi add constraint surat_pdf_storage_coordinates_complete check (
 (pdf_bucket is null and pdf_object_path is null and pdf_storage_origin is null) or
 (pdf_bucket=btrim(pdf_bucket) and pdf_bucket~'^[a-z0-9][a-z0-9._-]{0,62}$'
  and pdf_object_path=btrim(pdf_object_path) and pdf_object_path!~*'^[a-z][a-z0-9+.-]*://' and pdf_object_path!~'^/' and position(E'\\' in pdf_object_path)=0
  and pdf_object_path!~'(^|/)\.{1,2}(/|$)' and lower(pdf_object_path)!~'(^|/)storage/v1/(object|render)(/|$)' and lower(pdf_object_path)!~'%(2f|5c)'
  and pdf_storage_origin in ('primary','external')));
alter table public.document_pdf_jobs add constraint document_pdf_job_storage_coordinates_complete check (
 (pdf_bucket is null and pdf_object_path is null and pdf_storage_origin is null) or
 (pdf_bucket=btrim(pdf_bucket) and pdf_bucket~'^[a-z0-9][a-z0-9._-]{0,62}$'
  and pdf_object_path=btrim(pdf_object_path) and pdf_object_path!~*'^[a-z][a-z0-9+.-]*://' and pdf_object_path!~'^/' and position(E'\\' in pdf_object_path)=0
  and pdf_object_path!~'(^|/)\.{1,2}(/|$)' and lower(pdf_object_path)!~'(^|/)storage/v1/(object|render)(/|$)' and lower(pdf_object_path)!~'%(2f|5c)'
  and pdf_storage_origin in ('primary','external')));
create unique index file_view_tokens_recommendation_attempt_idx on public.file_view_tokens(transport_attempt_id,surat_id)
where purpose='external_marison_recommendation_pdf' and transport_attempt_id is not null and revoked_at is null;
create unique index file_view_tokens_recommendation_dispatch_active_idx on public.file_view_tokens(dispatch_id,surat_id)
where purpose='external_marison_recommendation_pdf' and dispatch_id is not null and revoked_at is null;

create or replace function public.recommendation_pdf_is_current(p_child_surat_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.surat_registrasi c
  join public.document_pdf_jobs j on j.surat_id=c.id and j.signature_id is null
  cross join lateral (select public.recommendation_pdf_render_payload(c.id,c.file_path) render_payload) r
  where c.id=p_child_surat_id and upper(coalesce(c.status::text,'')) in ('DONE','SELESAI','COMPLETED')
   and nullif(btrim(coalesce(c.pdf_path,'')),'') is not null and j.status='done'
   and j.source_file_path=c.file_path and j.pdf_url=c.pdf_path
   and c.pdf_bucket is not null and c.pdf_object_path is not null and c.pdf_storage_origin is not null
   and j.pdf_bucket=c.pdf_bucket and j.pdf_object_path=c.pdf_object_path and j.pdf_storage_origin=c.pdf_storage_origin
   and j.render_payload=r.render_payload and j.recommendation_content_fingerprint=public.recommendation_content_fingerprint(r.render_payload))
$$;

create or replace function public.guard_recommendation_child_final_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if upper(coalesce(old.status::text,'')) not in ('DONE','SELESAI','COMPLETED')
    and upper(coalesce(new.status::text,'')) in ('DONE','SELESAI','COMPLETED')
    and exists(select 1 from public.surat_linked_documents l where l.child_surat_id=new.id and l.link_type='recommendation' and l.status='active')
    and not exists(select 1 from public.document_pdf_jobs j
     cross join lateral (select public.recommendation_pdf_render_payload(new.id,new.file_path) render_payload) r
     where j.surat_id=new.id and j.signature_id is null and j.status='done'
      and j.source_file_path=new.file_path and j.pdf_url=new.pdf_path
      and new.pdf_bucket is not null and new.pdf_object_path is not null and new.pdf_storage_origin is not null
      and j.pdf_bucket=new.pdf_bucket and j.pdf_object_path=new.pdf_object_path and j.pdf_storage_origin=new.pdf_storage_origin
      and j.render_payload=r.render_payload and j.recommendation_content_fingerprint=public.recommendation_content_fingerprint(r.render_payload)) then
  raise exception 'Dokumen rekomendasi hanya dapat selesai melalui publikasi PDF canonical.' using errcode='55000';
 end if;return new;
end$$;

drop function if exists public.publish_document_pdf_job(uuid,text,text,text,uuid);
create function public.publish_document_pdf_job(p_job_id uuid,p_source_file_path text,p_content_fingerprint text,p_pdf_url text,p_lease_token uuid,p_pdf_bucket text,p_pdf_object_path text,p_pdf_storage_origin text)
returns public.document_pdf_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.document_pdf_jobs;v_surat public.surat_registrasi%rowtype;v_payload jsonb;v_fingerprint text;
begin
 if p_pdf_bucket is null or p_pdf_bucket<>btrim(p_pdf_bucket) or p_pdf_bucket!~'^[a-z0-9][a-z0-9._-]{0,62}$'
    or p_pdf_object_path is null or p_pdf_object_path<>btrim(p_pdf_object_path) or p_pdf_object_path~*'^[a-z][a-z0-9+.-]*://' or p_pdf_object_path~'^/' or position(E'\\' in p_pdf_object_path)>0
    or p_pdf_object_path~'(^|/)\.{1,2}(/|$)' or lower(p_pdf_object_path)~'(^|/)storage/v1/(object|render)(/|$)' or lower(p_pdf_object_path)~'%(2f|5c)'
    or p_pdf_storage_origin not in ('primary','external') then raise exception 'Canonical PDF coordinates required' using errcode='22023';end if;
 select * into v_job from public.document_pdf_jobs where id=p_job_id for update;
 if not found then raise exception 'Job PDF tidak ditemukan' using errcode='P0002';end if;
 select * into v_surat from public.surat_registrasi where id=v_job.surat_id for update;
 if v_job.status='done' then
  if v_job.lease_token=p_lease_token and v_job.pdf_bucket=p_pdf_bucket and v_job.pdf_object_path=p_pdf_object_path and v_job.pdf_storage_origin=p_pdf_storage_origin then return v_job;end if;
  raise exception 'Job PDF pointer differs' using errcode='55000';
 end if;
 if v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token or v_job.lease_expires_at<=clock_timestamp() then raise exception 'Stale PDF lease' using errcode='42501';end if;
 v_payload:=public.recommendation_pdf_render_payload(v_job.surat_id,v_job.source_file_path);v_fingerprint:=public.recommendation_content_fingerprint(v_payload);
 if v_job.recommendation_content_fingerprint is distinct from p_content_fingerprint or v_job.render_payload is distinct from v_payload or v_fingerprint is distinct from p_content_fingerprint or v_job.source_file_path is distinct from p_source_file_path or v_surat.file_path is distinct from p_source_file_path then raise exception 'Stale PDF source' using errcode='40001';end if;
 update public.document_pdf_jobs set status='done',pdf_url=p_pdf_url,pdf_bucket=p_pdf_bucket,pdf_object_path=p_pdf_object_path,pdf_storage_origin=p_pdf_storage_origin,error_message=null,updated_at=clock_timestamp(),finished_at=clock_timestamp() where id=p_job_id returning * into v_job;
 update public.surat_registrasi set pdf_path=p_pdf_url,pdf_bucket=p_pdf_bucket,pdf_object_path=p_pdf_object_path,pdf_storage_origin=p_pdf_storage_origin,status=case when upper(coalesce(status::text,''))='PDF_PENDING' then 'DONE' else status end,updated_at=clock_timestamp() where id=v_job.surat_id and upper(coalesce(status::text,'')) in ('PDF_PENDING','DONE','SELESAI','COMPLETED');
 if not found then raise exception 'Surat recommendation no longer final' using errcode='40001';end if;return v_job;
end$$;

create function public.mint_recommendation_file_view_token(p_token_hash text,p_surat_id uuid,p_dispatch_id uuid,p_lease_token uuid,p_attempt_id uuid,p_requested_by uuid)
returns table(token_id uuid,minted boolean) language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_dispatch public.marison_outbound_dispatches%rowtype;v record;
begin
 if p_token_hash!~'^[0-9a-f]{64}$' or p_attempt_id is null or p_dispatch_id is null or p_lease_token is null then raise exception 'Invalid token mint input' using errcode='22023';end if;
 if coalesce(auth.role(),'')<>'service_role' and session_user<>'postgres' then raise exception 'Service role required' using errcode='42501';end if;
 select * into v_dispatch from public.marison_outbound_dispatches where id=p_dispatch_id for update;
 if not found or v_dispatch.status<>'processing' or v_dispatch.lease_token is distinct from p_lease_token
    or v_dispatch.lease_expires_at is null or v_dispatch.lease_expires_at<=clock_timestamp() or v_dispatch.post_started_at is not null
    or not exists(select 1 from public.surat_linked_documents l where l.parent_surat_id=v_dispatch.surat_id and l.child_surat_id=p_surat_id and l.link_type='recommendation' and l.status='active') then
  raise exception 'Active dispatch lease and recommendation reference required' using errcode='42501';
 end if;
 for v in update public.file_view_tokens f set revoked_at=clock_timestamp(),revoke_reason='dispatch_lease_reclaimed'
  where f.dispatch_id=p_dispatch_id and f.surat_id=p_surat_id and f.purpose='external_marison_recommendation_pdf'
   and f.revoked_at is null and f.dispatch_lease_token is distinct from p_lease_token returning f.* loop
  insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,reason) values(v.id,v.token_hash,v.surat_id,v.purpose,'revoked','dispatch_lease_reclaimed');
 end loop;
 if exists(select 1 from public.file_view_tokens where transport_attempt_id=p_attempt_id and surat_id=p_surat_id and revoked_at is null) then raise exception 'Attempt already minted; raw bearer cannot be recovered safely' using errcode='55000';end if;
 insert into public.file_view_tokens(token_hash,bucket,object_path,storage_origin,requested_by,surat_id,purpose,expires_at,transport_attempt_id,dispatch_id,dispatch_lease_token)
 select p_token_hash,s.pdf_bucket,s.pdf_object_path,s.pdf_storage_origin,p_requested_by,s.id,'external_marison_recommendation_pdf',null,p_attempt_id,p_dispatch_id,p_lease_token from public.surat_registrasi s
 where s.id=p_surat_id and s.pdf_bucket~'^[a-z0-9][a-z0-9._-]{0,62}$' and s.pdf_bucket=btrim(s.pdf_bucket)
  and s.pdf_object_path=btrim(s.pdf_object_path) and s.pdf_object_path!~*'^[a-z][a-z0-9+.-]*://' and s.pdf_object_path!~'^/' and position(E'\\' in s.pdf_object_path)=0
  and s.pdf_object_path!~'(^|/)\.{1,2}(/|$)' and lower(s.pdf_object_path)!~'(^|/)storage/v1/(object|render)(/|$)' and lower(s.pdf_object_path)!~'%(2f|5c)'
  and s.pdf_storage_origin in ('primary','external') and public.recommendation_pdf_is_current(s.id) returning id into v_id;
 if v_id is null then raise exception 'Current canonical recommendation PDF required' using errcode='55000';end if;
 insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,actor_id) values(v_id,p_token_hash,p_surat_id,'external_marison_recommendation_pdf','created',p_requested_by);
 token_id:=v_id;minted:=true;return next;
end$$;

create function public.cleanup_recommendation_file_view_tokens(p_attempt_id uuid,p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare v record;v_count integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user<>'postgres' then raise exception 'Service role required' using errcode='42501';end if;
 if p_attempt_id is null or nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Attempt and reason required' using errcode='22023';end if;
 for v in update public.file_view_tokens f set revoked_at=clock_timestamp(),revoke_reason=p_reason from public.marison_outbound_dispatches d
  where f.transport_attempt_id=p_attempt_id and f.purpose='external_marison_recommendation_pdf' and f.revoked_at is null and d.id=f.dispatch_id
   and d.post_started_at is null and d.status not in ('succeeded','outcome_unknown') returning f.* loop
  v_count:=v_count+1;insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,reason) values(v.id,v.token_hash,v.surat_id,v.purpose,'revoked',p_reason);
 end loop;return v_count;
end$$;

create function public.cleanup_stale_recommendation_file_view_tokens(p_stale_after interval default interval '15 minutes')
returns integer language plpgsql security definer set search_path='' as $$
declare v record;v_count integer:=0;v_reason constant text:='orphaned_pre_post_materialization';
begin
 if coalesce(auth.role(),'')<>'service_role' and session_user<>'postgres' then raise exception 'Service role required' using errcode='42501';end if;
 if p_stale_after is null or p_stale_after<interval '1 minute' or p_stale_after>interval '24 hours' then raise exception 'Stale interval must be between 1 minute and 24 hours' using errcode='22023';end if;
 for v in update public.file_view_tokens f set revoked_at=clock_timestamp(),revoke_reason=v_reason from public.marison_outbound_dispatches d
  where f.dispatch_id=d.id and f.purpose='external_marison_recommendation_pdf' and f.revoked_at is null and f.minted_at<=clock_timestamp()-p_stale_after
   and d.post_started_at is null and (d.status in ('pending','failed_retryable') or (d.status='processing' and (d.lease_expires_at is null or d.lease_expires_at<=clock_timestamp())))
  returning f.* loop
   v_count:=v_count+1;insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,reason) values(v.id,v.token_hash,v.surat_id,v.purpose,'revoked',v_reason);
 end loop;return v_count;
end$$;

drop function if exists public.mark_marison_outbound_post_started(uuid,uuid);
create function public.mark_marison_outbound_post_started(p_job_id uuid,p_lease_token uuid,p_materialization_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.marison_outbound_dispatches%rowtype;v_expected integer;v_valid integer;v_active integer;
begin
 if p_lease_token is null or p_materialization_attempt_id is null then raise exception 'Lease token and materialization attempt are required' using errcode='22023';end if;
 select * into v_job from public.marison_outbound_dispatches where id=p_job_id for update;
 if not found or v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at is null or v_job.lease_expires_at<=clock_timestamp() or v_job.post_started_at is not null
    or v_job.payload is null or v_job.payload_body is null or v_job.payload_hash is null then
  raise exception 'Stale lease or payload is not prepared' using errcode='55000';
 end if;
 if v_job.kind='asset' and public.recommendation_all_items_rejected(v_job.surat_id) then
  update public.marison_outbound_dispatches set status='skipped',skipped_code='all_recommendations_rejected',skipped_reason='All recommendations rejected before POST.',completed_at=clock_timestamp(),lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp() where id=p_job_id;
  return jsonb_build_object('post_started',false,'skipped',true,'code','all_recommendations_rejected');
 end if;
 with payload_nodes as (select value from jsonb_path_query(v_job.payload,'$.**') q(value)), expected as (
  select distinct (value->>'surat_id')::uuid surat_id from payload_nodes
  where jsonb_typeof(value)='object' and value->>'type'='sigap_recommendation_pdf'
    and coalesce(value->>'surat_id','')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 ) select count(*) into v_expected from expected;
 select count(*) into v_active from public.file_view_tokens f where f.dispatch_id=p_job_id and f.purpose='external_marison_recommendation_pdf' and f.revoked_at is null;
 with payload_nodes as (select value from jsonb_path_query(v_job.payload,'$.**') q(value)), expected as (
  select distinct (value->>'surat_id')::uuid surat_id from payload_nodes
  where jsonb_typeof(value)='object' and value->>'type'='sigap_recommendation_pdf'
    and coalesce(value->>'surat_id','')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 ) select count(*) into v_valid from expected e join public.file_view_tokens f on f.surat_id=e.surat_id
  join public.surat_linked_documents l on l.parent_surat_id=v_job.surat_id and l.child_surat_id=e.surat_id and l.link_type='recommendation' and l.status='active'
  join public.surat_registrasi s on s.id=e.surat_id
  where f.dispatch_id=p_job_id and f.transport_attempt_id=p_materialization_attempt_id and f.dispatch_lease_token=p_lease_token
   and f.purpose='external_marison_recommendation_pdf' and f.revoked_at is null and f.token_hash is not null
   and f.bucket=s.pdf_bucket and f.object_path=s.pdf_object_path and f.storage_origin=s.pdf_storage_origin
   and public.recommendation_pdf_is_current(s.id);
 if v_active<>v_expected or v_valid<>v_expected then raise exception 'Materialized recommendation links are stale or incomplete' using errcode='55000';end if;
 update public.marison_outbound_dispatches set post_started_at=clock_timestamp(),last_attempt_at=clock_timestamp(),lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=p_job_id;
 return jsonb_build_object('post_started',true,'skipped',false,'code',null);
end$$;

drop function if exists public.consume_file_view_token(text);
create function public.consume_file_view_token(p_token_hash text) returns table(token_id uuid,surat_id uuid,bucket text,object_path text,storage_origin text)
language plpgsql security definer set search_path='' as $$
declare v public.file_view_tokens%rowtype;
begin
 select * into v from public.file_view_tokens f where f.token_hash=p_token_hash and f.revoked_at is null and (f.expires_at is null or f.expires_at>now()) for update;
 if not found then return;end if;
 if v.purpose='external_marison_recommendation_pdf' then
  select s.pdf_bucket,s.pdf_object_path,s.pdf_storage_origin into bucket,object_path,storage_origin from public.surat_linked_documents l join public.surat_registrasi s on s.id=l.child_surat_id
  where s.id=v.surat_id and l.link_type='recommendation' and l.status='active' and public.recommendation_pdf_is_current(s.id) order by l.updated_at desc,l.id desc limit 1 for share of l,s;
  if not found or bucket is distinct from v.bucket or object_path is distinct from v.object_path or storage_origin is distinct from v.storage_origin then return;end if;
  update public.file_view_tokens set last_accessed_at=clock_timestamp() where id=v.id;insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action) values(v.id,v.token_hash,v.surat_id,v.purpose,'resolved');
 else
  bucket:=v.bucket;object_path:=v.object_path;storage_origin:=v.storage_origin;if v.purpose not in ('email','external_marison') then update public.file_view_tokens set consumed_at=now() where id=v.id;end if;
 end if;token_id:=v.id;surat_id:=v.surat_id;return next;
end$$;

create function public.revoke_recommendation_links_on_link_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if old.link_type='recommendation' and old.status='active' and (new.status='cancelled' or new.child_surat_id is distinct from old.child_surat_id) then
  for v in update public.file_view_tokens set revoked_at=clock_timestamp(),revoke_reason='recommendation link cancelled or replaced' where surat_id=old.child_surat_id and purpose='external_marison_recommendation_pdf' and revoked_at is null returning * loop
   insert into public.file_view_token_audit(token_id,token_hash,surat_id,purpose,action,reason) values(v.id,v.token_hash,v.surat_id,v.purpose,'revoked','recommendation link cancelled or replaced');
  end loop;
 end if;return new;
end$$;
create trigger revoke_recommendation_links_on_link_change after update of status,child_surat_id on public.surat_linked_documents for each row execute function public.revoke_recommendation_links_on_link_change();

revoke execute on function public.recommendation_all_items_rejected(uuid) from public,anon,authenticated;
grant execute on function public.recommendation_all_items_rejected(uuid) to service_role;
revoke all on function public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text),public.mint_recommendation_file_view_token(text,uuid,uuid,uuid,uuid,uuid),public.cleanup_recommendation_file_view_tokens(uuid,text),public.cleanup_stale_recommendation_file_view_tokens(interval),public.consume_file_view_token(text),public.mark_marison_outbound_post_started(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text),public.mint_recommendation_file_view_token(text,uuid,uuid,uuid,uuid,uuid),public.cleanup_recommendation_file_view_tokens(uuid,text),public.cleanup_stale_recommendation_file_view_tokens(interval),public.consume_file_view_token(text),public.mark_marison_outbound_post_started(uuid,uuid,uuid) to service_role;

update public.marison_outbound_dispatches d set status='skipped',skipped_code='all_recommendations_rejected',skipped_reason='All recommendations rejected before POST.',completed_at=clock_timestamp(),lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
where d.kind='asset' and (d.status in ('pending','failed_retryable') or (d.status='processing' and (d.lease_expires_at is null or d.lease_expires_at<=clock_timestamp()))) and d.response is null and d.external_reference is null and d.post_started_at is null and public.recommendation_all_items_rejected(d.surat_id);
