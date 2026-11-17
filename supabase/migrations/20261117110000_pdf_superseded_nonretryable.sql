begin;

-- A permanently superseded PDF is not a serialization failure. PostgREST 14
-- retries 40001 inside the server even when client transport retries are off.
-- Patch only reviewed PDF rejections, preserving function identities and guards.
do $patch$
declare
  target record;
  definition text;
  old_raise text;
  new_raise text;
  old_count integer;
  new_count integer;
begin
  for target in select * from (values
    ('public.complete_document_pdf_job_pre_keu10(uuid,text,uuid)', 'Native PDF source changed', 2),
    ('public.complete_document_pdf_job(uuid,text,uuid)', 'Stale KEU10 PDF generation', 1),
    ('public.complete_document_pdf_job(uuid,text,uuid)', 'Stale KEU10 PDF source', 1),
    ('public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text)', 'Stale PDF source', 1),
    ('public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text)', 'Surat recommendation no longer final', 1),
    ('public.freeze_keu10_pdf_job()', 'KEU10 PDF source must match its document/signature', 1)
  ) as reviewed(signature,message,expected_count)
  loop
    definition:=replace(pg_get_functiondef(target.signature::regprocedure),E'\r\n',E'\n');
    old_raise:=format('raise exception %L using errcode=%L;',target.message,'40001');
    new_raise:=format('raise exception %L using errcode=%L, detail=%L;',target.message,'PT409','PDF_SOURCE_CHANGED');
    old_count:=(length(definition)-length(replace(definition,old_raise,'')))/length(old_raise);
    new_count:=(length(definition)-length(replace(definition,new_raise,'')))/length(new_raise);
    if old_count=target.expected_count and new_count=0 then
      execute replace(definition,old_raise,new_raise);
    elsif old_count<>0 or new_count<>target.expected_count then
      raise exception 'Unknown reviewed PDF rejection in %: %',target.signature,target.message using errcode='55000';
    end if;
  end loop;
end $patch$;

notify pgrst,'reload schema';
commit;
