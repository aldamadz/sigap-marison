begin;

create or replace function public.freeze_signature_sla_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare dept uuid;ready_at timestamptz;policy jsonb;
begin
 if tg_op='UPDATE' then new.sla_policy_snapshot:=old.sla_policy_snapshot;else new.sla_policy_snapshot:=null;end if;
 if new.sla_policy_snapshot is null and (tg_op='INSERT' or old.available_at is null)
  and not coalesce(new.is_signed,false) and new.available_at is not null and new.step_order>1 then
  -- Snapshot JSON is historical attribution, never authority for receiving holds.
  -- master_departments has no active flag; require an existing server-side row.
  select d.id into dept from public.profiles p
   join public.master_departments d on d.id=p.department_id where p.id=new.user_id;
  if dept is not null then
   policy:=public.department_receiving_policy(dept,now());
   new.sla_policy_snapshot:=policy;
  end if;
 end if;
 if new.sla_policy_snapshot is not null then
  ready_at:=(new.sla_policy_snapshot#>>'{receiving,available_at}')::timestamptz;
  if ready_at>now() then
   new.available_at:=greatest(new.available_at,ready_at);
   if coalesce(new.is_signed,false) or new.verification_status='verified' then
    raise exception 'Permohonan masuk ke periode berikutnya. Dapat diproses mulai %.',ready_at using errcode='55000';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.freeze_signature_sla_policy() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
