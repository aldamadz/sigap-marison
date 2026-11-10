begin;

-- KEU1 always uses quantity x unit price, even on legacy rows with a nominal key.
do $patch$
declare identity regprocedure:='requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb)'::regprocedure;
  body text; patched text; anchor text;
begin
  select prosrc into body from pg_proc where oid=identity;
  if position('SIGAP full signer KEU1 totals v1' in body)>0 then return;end if;
  if position('is_financial boolean;' in body)=0 then raise exception 'Unknown full signer declaration';end if;
  patched:=replace(body,'is_financial boolean;','is_financial boolean; is_keu1 boolean;');
  anchor:='is_financial:=doc.form_input_data ? ''fund_amount'';';
  if position(anchor in patched)=0 then raise exception 'Unknown full signer financial setup';end if;
  patched:=replace(patched,anchor,anchor||E'\n  -- SIGAP full signer KEU1 totals v1\n'
    ||E'  select exists(select 1 from public.form_usages u join public.master_forms f on f.id=u.form_id\n'
    ||E'    where u.id=coalesce(doc.form_usage_id,doc.penggunaan_id) and upper(btrim(f.nomor_form)) in (''FM-UAI.KEU-01-00'',''FM-MBN.KEU-01-00'')) into is_keu1;');
  anchor:=$old$        if coalesce(nullif(item->>'nominal',''),nullif(item->>'estimasi_harga_satuan',''),'')!~'^[0-9]+$' then$old$;
  if position(anchor in patched)=0 then raise exception 'Unknown full signer nominal calculation';end if;
  patched:=replace(patched,anchor,$new$        if is_keu1 then
          if coalesce(item->>'estimasi_harga_satuan','')!~'^[0-9]+$' then
            raise exception 'Harga satuan Kas Kecil tidak valid.' using errcode='22023';end if;
          amount:=round(quantity*(item->>'estimasi_harga_satuan')::numeric);
          item:=item||jsonb_build_object('total',amount);
        else
          if coalesce(nullif(item->>'nominal',''),nullif(item->>'estimasi_harga_satuan',''),'')!~'^[0-9]+$' then$new$);
  anchor:=E'        total:=total+amount;';
  if position(anchor in patched)=0 then raise exception 'Unknown full signer total accumulation';end if;
  patched:=replace(patched,anchor,E'        end if;\n'||anchor);
  execute replace(pg_get_functiondef(identity),body,patched);
end $patch$;

notify pgrst,'reload schema';
commit;
