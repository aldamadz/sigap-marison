begin;
create schema if not exists personal_reminder_internal;
revoke all on schema personal_reminder_internal from public,anon,authenticated,service_role;
alter schema personal_reminder_internal owner to postgres;

create table if not exists public.personal_reminders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 calendar_entry_id uuid references public.work_calendar_entries(id) on delete cascade,
 surat_id uuid references public.surat_registrasi(id) on delete cascade,
 remind_at timestamptz not null,
 popup boolean not null default false,
 status text not null default 'scheduled' check(status in ('scheduled','sent','cancelled')),
 version integer not null default 1 check(version>0),
 notification_id uuid references public.notifications(id) on delete set null,
 last_notified_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((calendar_entry_id is null)<>(surat_id is null))
);
create unique index if not exists personal_calendar_reminder_owner on public.personal_reminders(user_id,calendar_entry_id) where calendar_entry_id is not null;
create unique index if not exists personal_surat_reminder_owner on public.personal_reminders(user_id,surat_id) where surat_id is not null;
create index if not exists personal_reminders_due on public.personal_reminders(remind_at,id) where status='scheduled';
alter table public.personal_reminders owner to postgres;
alter table public.personal_reminders enable row level security;
revoke all on public.personal_reminders from public,anon,authenticated,service_role;
grant select on public.personal_reminders to authenticated;
drop policy if exists personal_reminders_own on public.personal_reminders;
create policy personal_reminders_own on public.personal_reminders for select to authenticated using(user_id=(select auth.uid()));

-- Invoke the canonical surat visibility predicate as the reminder owner. The
-- service scheduler must not inherit its own elevated visibility or leak JWT state.
create or replace function personal_reminder_internal.target_active(p_user uuid,p_calendar uuid,p_surat uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('request.jwt.claim.sub',true); allowed boolean;
begin
 if not exists(select 1 from public.profiles where id=p_user and is_active is true and deleted_at is null) then return false; end if;
 if p_calendar is not null then
  return exists(select 1 from public.work_calendar_entries where id=p_calendar and owner_id=p_user and deleted_at is null and status<>'completed');
 end if;
 if p_surat is null or not exists(select 1 from public.surat_registrasi where id=p_surat and status::text in ('PROSES','MENUNGGU_PERBAIKAN')) then return false;end if;
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 allowed:=public.can_monitor_surat_progress(p_surat);
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 return coalesce(allowed,false);
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);raise;
end $$;

create or replace function public.save_personal_reminder(p_kind text,p_target_id uuid,p_remind_at timestamptz default null,
 p_popup boolean default false,p_expected_version integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved public.personal_reminders; calendar_id uuid; surat uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and is_active is true and deleted_at is null) then
  raise exception 'Sesi pengguna tidak aktif.' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('calendar','surat') or p_target_id is null or p_expected_version is null or p_expected_version<0 or p_popup is null then
  raise exception 'Pengaturan pengingat tidak valid.' using errcode='22023';end if;
 calendar_id:=case when p_kind='calendar' then p_target_id end;surat:=case when p_kind='surat' then p_target_id end;
 perform pg_advisory_xact_lock(hashtextextended('personal-reminder:'||actor::text||':'||p_kind||':'||p_target_id::text,887));
 select * into saved from public.personal_reminders r where r.user_id=actor
  and (r.calendar_entry_id=calendar_id or r.surat_id=surat) for update;
 if coalesce(saved.version,0)<>p_expected_version then raise exception 'Pengingat telah berubah. Muat ulang dan coba lagi.' using errcode='40001';end if;
 if p_remind_at is not null then
  if not isfinite(p_remind_at) or p_remind_at<=clock_timestamp() then
   raise exception 'Pilih tanggal dan jam pengingat di masa mendatang.' using errcode='22023';end if;
  if not personal_reminder_internal.target_active(actor,calendar_id,surat) then
   raise exception 'Pekerjaan atau pengajuan tidak tersedia untuk pengingat.' using errcode='42501';end if;
 elsif saved.id is null then return jsonb_build_object('status','off','version',0);end if;
 if saved.id is not null then
  if saved.status='scheduled' and saved.remind_at=p_remind_at and saved.popup=p_popup then return to_jsonb(saved);end if;
  update public.notification_push_deliveries set status='skipped',lease_token=null,lease_until=null,updated_at=clock_timestamp(),last_error_code='reminder_changed'
   where notification_id=saved.notification_id and status in ('pending','leased');
  update public.personal_reminders set remind_at=coalesce(p_remind_at,remind_at),popup=p_popup,
   status=case when p_remind_at is null then 'cancelled' else 'scheduled' end,version=version+1,
   notification_id=null,updated_at=clock_timestamp() where id=saved.id returning * into saved;
 else
  insert into public.personal_reminders(user_id,calendar_entry_id,surat_id,remind_at,popup)
   values(actor,calendar_id,surat,p_remind_at,p_popup) returning * into saved;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.save_personal_reminder(text,uuid,timestamptz,boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.save_personal_reminder(text,uuid,timestamptz,boolean,integer) to authenticated;

create or replace function personal_reminder_internal.popup_allowed(p_notification uuid,p_user uuid,p_data jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.personal_reminders r where r.user_id=p_user and r.notification_id=p_notification
  and r.id::text=p_data->>'personal_reminder_id' and r.version::text=p_data->>'personal_reminder_version'
  and r.status='sent' and r.popup and personal_reminder_internal.target_active(r.user_id,r.calendar_entry_id,r.surat_id));
$$;

-- Disable the retired automatic reminders; ordinary workflow notifications keep
-- their existing transport and authorization. Defaults never imply user consent.
alter table public.notification_preferences alter column team_notifications set default false,
 alter column calendar_reminders set default false,alter column calendar_push set default false;
do $transport$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('public.enqueue_notification_push()'::regprocedure);
 if position('personal_reminder_internal.popup_allowed' in definition)=0 then
  anchor:='where b.user_id=new.user_id';
  if position(anchor in definition)=0 then raise exception 'Unknown notification enqueue body';end if;
  definition:=replace(definition,anchor,anchor||E'\n  and coalesce(new.data->>''category'','''') not in (''team_digest'',''calendar_scheduled'',''calendar_deadline'',''calendar_result'')\n  and (new.data->>''category'' is distinct from ''personal_reminder'' or personal_reminder_internal.popup_allowed(new.id,new.user_id,new.data))');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.claim_notification_push(integer,uuid[])'::regprocedure);
 if position('personal_reminder_internal.popup_allowed' in definition)=0 then
  anchor:='where d.status in (''pending'',''leased'') and (';
  if position(anchor in definition)=0 or position('where (d.status=''pending''' in definition)=0 then raise exception 'Unknown notification claim body';end if;
  definition:=replace(definition,anchor,anchor||E'coalesce(n.data->>''category'','''') in (''team_digest'',''calendar_scheduled'',''calendar_deadline'',''calendar_result'')\n   or n.data->>''category''=''personal_reminder'' and not personal_reminder_internal.popup_allowed(n.id,n.user_id,n.data) or ');
  definition:=replace(definition,'where (d.status=''pending''',E'where coalesce(n.data->>''category'','''') not in (''team_digest'',''calendar_scheduled'',''calendar_deadline'',''calendar_result'')\n   and (n.data->>''category'' is distinct from ''personal_reminder'' or personal_reminder_internal.popup_allowed(n.id,n.user_id,n.data)) and (d.status=''pending''');
  execute definition;
 end if;
end $transport$;

create or replace function public.generate_notification_reminders_at(p_at timestamptz,p_audience uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare reminder public.personal_reminders; notified uuid; link text; total integer:=0;
begin
 for reminder in select r.* from public.personal_reminders r where r.status='scheduled' and r.remind_at<=p_at
  and (p_audience is null or r.user_id=any(p_audience)) order by r.remind_at,r.id limit 100 for update of r skip locked
 loop
  if not personal_reminder_internal.target_active(reminder.user_id,reminder.calendar_entry_id,reminder.surat_id) then
   update public.personal_reminders set status='cancelled',updated_at=clock_timestamp() where id=reminder.id;
   continue;
  end if;
  notified:=gen_random_uuid();
  link:=case when reminder.calendar_entry_id is not null then
    '/calendar?date='||(p_at at time zone 'Asia/Jakarta')::date::text||'&view=day&entry='||reminder.calendar_entry_id::text
    else '/status-pengajuan?document='||reminder.surat_id::text end;
  update public.personal_reminders set status='sent',notification_id=null,last_notified_at=p_at,updated_at=clock_timestamp() where id=reminder.id;
  -- The ordinary insert trigger cannot enqueue a personal popup until its
  -- server-owned receipt is bound below in this transaction.
  insert into public.notifications(id,user_id,type,title,message,link,is_read,data)
   values(notified,reminder.user_id,'info','Pengingat pribadi',
    case when reminder.calendar_entry_id is not null then 'Waktunya menindaklanjuti pekerjaan yang Anda ingatkan.' else 'Waktunya memantau pengajuan yang Anda ingatkan.' end,
    link,false,jsonb_build_object('category','personal_reminder','personal_reminder_id',reminder.id,
      'personal_reminder_version',reminder.version,'surat_id',reminder.surat_id,'entry_id',reminder.calendar_entry_id,
      'dedupe_key','sigap:personal:'||reminder.id::text||':'||reminder.version::text));
  update public.personal_reminders set notification_id=notified where id=reminder.id;
  -- The first enqueue sees no receipt; enqueue again only after it is bound.
  insert into public.notification_push_deliveries(notification_id,subscription_id,user_id)
   select notified,s.id,reminder.user_id from public.web_push_subscriptions s
   where reminder.popup and s.user_id=reminder.user_id and s.disabled_at is null and octet_length(s.subscription::text)<=8192
   order by s.created_at desc,s.id limit 10 on conflict(notification_id,subscription_id) do nothing;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.generate_notification_reminders_at(timestamptz,uuid[]) from public,anon,authenticated,service_role;

alter function public.save_personal_reminder(text,uuid,timestamptz,boolean,integer) owner to postgres;
alter function public.generate_notification_reminders_at(timestamptz,uuid[]) owner to postgres;
alter function personal_reminder_internal.target_active(uuid,uuid,uuid) owner to postgres;
alter function personal_reminder_internal.popup_allowed(uuid,uuid,jsonb) owner to postgres;
revoke all on all functions in schema personal_reminder_internal from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
