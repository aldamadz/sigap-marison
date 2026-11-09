-- Normalize the audited compact production definition before SLA-03's guarded patch.
-- Already deployed clocks and the canonical multiline definition are unchanged.
begin;
do $compat$
declare
  definition text;
  compact_anchor text := 'public.calculate_business_minutes(active.started_at,';
  canonical_anchor text := E'public.calculate_business_minutes(\n      active.started_at,';
begin
  select replace(pg_get_functiondef('public.get_user_active_sla_breach_count(uuid)'::regprocedure),chr(13),'') into definition;
  if position('sla_clock_internal.elapsed(' in definition)>0 then return;end if;
  if position(canonical_anchor in definition)>0 then return;end if;
  if position(compact_anchor in definition)=0
    or position('signature.id as signature_id' in definition)=0
    or position('public.signature_sla_config(active.signature_id,active.responsible_dept_id)' in definition)=0
    or position('where active.started_at is not null' in definition)=0
    or (length(definition)-length(replace(definition,compact_anchor,'')))/length(compact_anchor)<>1 then
    raise exception 'Unknown active breach compatibility shape';
  end if;
  execute replace(definition,compact_anchor,canonical_anchor);
end $compat$;
commit;
