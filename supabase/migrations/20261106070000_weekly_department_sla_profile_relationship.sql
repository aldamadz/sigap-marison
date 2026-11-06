begin;

-- Keep the grant pair unique without exposing a second inferred profile/department
-- embedding. Existing profile queries must retain their original direct relation.
alter table public.department_sla_managers add column if not exists id uuid not null default gen_random_uuid();
do $$declare current_key smallint[];id_attribute smallint;begin
 select attnum into strict id_attribute from pg_attribute
 where attrelid='public.department_sla_managers'::regclass and attname='id' and not attisdropped;
 select conkey into strict current_key from pg_constraint
 where conrelid='public.department_sla_managers'::regclass and contype='p';
 if current_key<>array[id_attribute]::smallint[] then
  if pg_get_constraintdef((select oid from pg_constraint where conrelid='public.department_sla_managers'::regclass and contype='p'))
   <>'PRIMARY KEY (dept_id, user_id)' then raise exception 'Unknown department manager primary key; audit before migration';end if;
  alter table public.department_sla_managers drop constraint department_sla_managers_pkey;
  alter table public.department_sla_managers add primary key(id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.department_sla_managers'::regclass and conname='department_sla_managers_scope_key') then
  alter table public.department_sla_managers add constraint department_sla_managers_scope_key unique(dept_id,user_id);
 end if;
end $$;

notify pgrst,'reload schema';
commit;
