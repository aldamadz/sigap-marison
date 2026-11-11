begin;

create or replace function unit_allocation_internal.title_for_count(p_title text,p_count integer)
returns text language plpgsql immutable set search_path='' as $$
declare title text:=btrim(coalesce(p_title,''));
begin
 if p_count is null or p_count<1 then raise exception 'Jumlah Unit terverifikasi tidak valid.' using errcode='22023';end if;
 if title='' then return 'Pengajuan SPK Unit: '||p_count||' Unit';end if;
 if title ~* '\m[0-9]+[[:space:]]+Unit\M' then
  return regexp_replace(title,'\m[0-9]+[[:space:]]+Unit\M',p_count||' Unit','i');
 end if;
 return title||' ('||p_count||' Unit)';
end $$;

-- Append server-owned history metadata without trusting any allocated_review from the row.
-- Preserve the existing RPC owner, ACLs and all allocation/addendum validation.
do $patch$
declare identity regprocedure:='public.get_verified_unit_allocation(uuid)'::regprocedure;
 body text; anchor text:='return doc.form_input_data;';
begin
 select prosrc into body from pg_proc where oid=identity;
 if position('SIGAP verified Unit presentation v1' in body)>0 then return;end if;
 if position(anchor in body)=0 then raise exception 'Unknown Unit allocation authority; audit before migration';end if;
 execute replace(pg_get_functiondef(identity),body,replace(body,anchor,
  E'-- SIGAP verified Unit presentation v1\n return doc.form_input_data || jsonb_build_object(''allocated_review'',\n'
  ||E' jsonb_build_object(''actor_id'',receipt.actor_id,''actor_name'',receipt.actor_name,''note'',receipt.note,\n'
  ||E' ''requested_count'',receipt.requested_count,''allocated_count'',receipt.allocated_count));'));
end $patch$;

create or replace function unit_allocation_internal.update_verified_title()
returns trigger language plpgsql security definer set search_path='' as $$
declare doc public.surat_registrasi;
begin
 select * into strict doc from public.surat_registrasi where id=new.surat_id for update;
 if not exists(select 1 from public.surat_signatures s where s.id=new.signature_id and s.surat_id=new.surat_id
   and s.verification_status='verified' and s.verified_by=new.actor_id and s.verified_at=new.verified_at)
  or new.request_snapshot is distinct from jsonb_build_object('requested_project',doc.form_input_data->'requested_project',
    'requested_unit_count',doc.form_input_data->'requested_unit_count')
  or new.allocation_snapshot is distinct from jsonb_build_object('allocated_project',doc.form_input_data->'allocated_project',
    'allocated_units',doc.form_input_data->'allocated_units','allocated_by_signature_id',doc.form_input_data->'allocated_by_signature_id') then
  raise exception 'Bukti pemeriksaan Unit tidak cocok.' using errcode='42501';
 end if;
 update public.surat_registrasi set judul_surat=unit_allocation_internal.title_for_count(doc.judul_surat,new.allocated_count)
  where id=doc.id;
 return new;
end $$;
revoke all on function unit_allocation_internal.title_for_count(text,integer),unit_allocation_internal.update_verified_title()
 from public,anon,authenticated,service_role;
grant execute on function unit_allocation_internal.title_for_count(text,integer) to postgres;
drop trigger if exists unit_allocation_verified_title on public.surat_unit_allocation_history;
create trigger unit_allocation_verified_title after insert on public.surat_unit_allocation_history
 for each row execute function unit_allocation_internal.update_verified_title();

-- No backfill: old PDFs, frozen dispatches and completed document versions stay intact.
notify pgrst,'reload schema';
commit;
