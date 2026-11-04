-- REC-06 follow-up: archival updates must never start fresh recommendation work.
begin;
do $patch$
declare v_definition text; v_anchor text;
begin
  v_definition:=replace(pg_get_functiondef('public.create_missing_revision_recommendation_task()'::regprocedure),E'\r\n',E'\n');
  if position('-- REC-06 active requests only' in v_definition)>0 then return; end if;
  v_anchor:=E'begin\n  if lower(coalesce(new.form_input_data';
  if position(v_anchor in v_definition)=0 then raise exception 'Unknown revision task trigger; audit before active-only patch.'; end if;
  execute replace(v_definition,v_anchor,$body$begin
  -- REC-06 active requests only; leave completed/rejected/cancelled archives intact.
  if coalesce(new.status::text,'') not in ('PROSES','MENUNGGU_PERBAIKAN') then return new; end if;
  if lower(coalesce(new.form_input_data$body$);
end $patch$;
commit;
