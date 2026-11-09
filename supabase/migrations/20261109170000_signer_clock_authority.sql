begin;

create or replace function sla_clock_internal.state(p_signature uuid,p_at timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sig public.surat_signatures; doc public.surat_registrasi; reasons text[]:='{}'; boundary integer;
begin
 select * into sig from public.surat_signatures where id=p_signature;
 if not found or sig.is_signed or sig.status='REJECTED' then return '{"phase":"stopped","reasons":[]}'::jsonb;end if;
 select * into doc from public.surat_registrasi where id=sig.surat_id;
 if not found or doc.status::text in ('DONE','SELESAI','COMPLETED','REJECTED','DITOLAK','VOID','CANCELLED') then
  return '{"phase":"stopped","reasons":[]}'::jsonb;
 end if;
 if sig.step_order<>doc.current_step then
  if sig.step_order>doc.current_step then return '{"phase":"upcoming","reasons":[]}'::jsonb;end if;
  -- An unsigned stage cannot erase its charged time by being skipped.
  return '{"phase":"ready","reasons":[]}'::jsonb;
 end if;
 if exists(select 1 from public.surat_revision_events e where e.surat_id=doc.id and e.status in ('open','awaiting_requester')) then
  reasons:=array_append(reasons,'Menunggu perbaikan pengajuan');
 end if;
 if not exists(select 1 from public.profiles p where p.id=sig.user_id and p.is_active is true and p.deleted_at is null) then
  reasons:=array_append(reasons,'Menunggu penandatangan aktif');
 end if;
 if sig.verification_required is true and sig.verification_status is distinct from 'verified' then
  reasons:=array_append(reasons,'Menunggu tim pemeriksa');
 end if;
 boundary:=sig.step_order+case when exists(select 1 from public.surat_signatures s where s.surat_id=doc.id and s.step_order>sig.step_order) then 1 else 0 end;
 if exists(select 1 from public.surat_recommendation_tasks t where t.parent_surat_id=doc.id and t.status<>'cancelled' and t.required_before_step<=boundary)
  and not exists(select 1 from public.surat_linked_documents l where l.parent_surat_id=doc.id and l.link_type='recommendation' and l.status='active' and public.recommendation_pdf_is_current(l.child_surat_id)) then
  reasons:=array_append(reasons,'Menunggu rekomendasi');
 end if;
 if cardinality(reasons)>0 then return jsonb_build_object('phase','waiting','reasons',reasons);end if;
 if sig.available_at>p_at then return jsonb_build_object('phase','scheduled','reasons',array['Menunggu periode penerimaan']);end if;
 return '{"phase":"ready","reasons":[]}'::jsonb;
end $$;

-- INVOKER is essential: canonical SECURITY DEFINER RPCs run as their owner,
-- whereas direct PostgREST writes (including business admins) remain authenticated.
create or replace function public.guard_surat_lifecycle_authority()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.status is distinct from old.status or new.current_step is distinct from old.current_step)
  and current_user not in ('postgres','supabase_admin','service_role') then
  raise exception 'Perubahan status dan tahap wajib melalui alur resmi.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_surat_lifecycle_authority() from public,anon,authenticated,service_role;
drop trigger if exists guard_surat_lifecycle_authority on public.surat_registrasi;
create trigger guard_surat_lifecycle_authority before update of status,current_step on public.surat_registrasi
 for each row execute function public.guard_surat_lifecycle_authority();
revoke all on function sla_clock_internal.state(uuid,timestamptz) from public,anon,authenticated,service_role;

-- Correct only the current interval; historical durations and receipts stay intact.
do $$declare r record;begin
 for r in select signature_id from sla_clock_internal.clocks loop
  perform sla_clock_internal.refresh(r.signature_id);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
