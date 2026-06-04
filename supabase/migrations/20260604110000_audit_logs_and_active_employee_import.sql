create or replace function public.audit_log_redact_payload(payload jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, case
    when key ~* '(password|secret|token|hmac|key)' then '"[REDACTED]"'::jsonb
    else value
  end), '{}'::jsonb)
  from jsonb_each(coalesce(payload, '{}'::jsonb));
$$;

create or replace function public.audit_log_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id text;
begin
  if TG_TABLE_NAME = 'activity_logs' then
    if TG_OP = 'DELETE' then return old; else return new; end if;
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
    case when TG_OP in ('UPDATE', 'DELETE') then public.audit_log_redact_payload(to_jsonb(old)) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then public.audit_log_redact_payload(to_jsonb(new)) else null end
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
  tables text[] := array[
    'profiles',
    'agendas',
    'master_entities',
    'master_offices',
    'master_departments',
    'master_department_aliases',
    'master_letter_types',
    'master_forms',
    'master_form_presets',
    'master_penggunaan_detail',
    'master_projects',
    'master_dept_pics',
    'department_kpi_configs',
    'surat_registrasi',
    'surat_signatures',
    'surat_attachments',
    'surat_chats',
    'finance_reviews',
    'notifications',
    'external_data_sources'
  ];
begin
  foreach table_name in array tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists trg_audit_%I on public.%I', table_name, table_name);
      execute format(
        'create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.audit_log_table_changes()',
        table_name,
        table_name
      );
    end if;
  end loop;
end;
$$;
