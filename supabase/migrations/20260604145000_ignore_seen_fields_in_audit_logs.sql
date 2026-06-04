create or replace function public.audit_log_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  v_record_id text;
  v_old_values jsonb;
  v_new_values jsonb;
  v_ignored_keys text[] := array[
    'updated_at',
    'created_at',
    'creator_seen_at',
    'pic_seen_at',
    'requester_seen_at',
    'seen_at',
    'read_at',
    'last_read_at'
  ];
begin
  if TG_TABLE_NAME = 'activity_logs' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  if TG_OP = 'UPDATE' then
    v_old_values := public.audit_log_redact_payload(to_jsonb(old));
    v_new_values := public.audit_log_redact_payload(to_jsonb(new));

    if (v_old_values - v_ignored_keys) = (v_new_values - v_ignored_keys) then
      return new;
    end if;
  end if;

  v_record_id := coalesce((case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '');

  insert into public.activity_logs (user_id, action, table_name, record_id, old_values, new_values)
  values (
    v_actor,
    case TG_OP
      when 'INSERT' then 'INSERT'::public.activity_action
      when 'UPDATE' then 'UPDATE'::public.activity_action
      when 'DELETE' then 'DELETE'::public.activity_action
    end,
    TG_TABLE_NAME,
    v_record_id,
    case
      when TG_OP = 'UPDATE' then v_old_values
      when TG_OP = 'DELETE' then public.audit_log_redact_payload(to_jsonb(old))
      else null
    end,
    case
      when TG_OP = 'UPDATE' then v_new_values
      when TG_OP = 'INSERT' then public.audit_log_redact_payload(to_jsonb(new))
      else null
    end
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
