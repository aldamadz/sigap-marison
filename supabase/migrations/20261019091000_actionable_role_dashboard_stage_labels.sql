-- CURRENT_ROLE is a SQL keyword; qualify the stage label in the dashboard RPC.
begin;
do $$
declare definition text;
 search_old text := 'department_name,current_signer_name,current_role) ilike';
 search_new text := 'department_name,current_signer_name,m.current_role) ilike';
 label_old text := '''current_role'',current_role,';
 label_new text := '''current_role'',page.current_role,';
begin
 select pg_get_functiondef('public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure)
 into definition;
 if position(search_new in definition)>0 and position(label_new in definition)>0 then return;end if;
 if position(search_old in definition)=0 or position(label_old in definition)=0 then
  raise exception 'Unexpected dashboard definition; audit before applying stage labels';
 end if;
 execute replace(replace(definition,search_old,search_new),label_old,label_new);
end;
$$;
notify pgrst,'reload schema';
commit;
