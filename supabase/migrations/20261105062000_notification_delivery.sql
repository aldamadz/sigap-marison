begin;
create table if not exists public.notification_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 team_notifications boolean not null default true,
 team_push boolean not null default false,
 calendar_reminders boolean not null default true,
 calendar_push boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select,insert,update,delete on public.notification_preferences to service_role;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.is_active is true and p.deleted_at is null));

create table if not exists public.notification_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications(id) on delete cascade,
 subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','leased','sent','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 4),
 available_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,last_error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(notification_id,subscription_id)
);
create index if not exists notification_push_pending_idx on public.notification_push_deliveries(available_at,created_at)
 where status in ('pending','leased');
alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.notification_push_deliveries to service_role;
create unique index if not exists notifications_sigap_event_key on public.notifications(user_id,(data->>'dedupe_key'))
 where data->>'dedupe_key' like 'sigap:%';

create or replace function public.enqueue_notification_push()
returns trigger language plpgsql security definer set search_path='' as $$
declare ready_at timestamptz:=now();signature_id uuid;
begin
 if new.is_read is true then return new;end if;
 if coalesce(new.data->>'signature_id','') ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
  signature_id:=(new.data->>'signature_id')::uuid;
  select greatest(now(),s.available_at) into ready_at from public.surat_signatures s where s.id=signature_id;
 end if;
 insert into public.notification_push_deliveries(notification_id,subscription_id,user_id,available_at)
 select new.id,b.id,new.user_id,coalesce(ready_at,now()) from public.web_push_subscriptions b
 join public.profiles p on p.id=b.user_id and p.is_active is true and p.deleted_at is null
 left join public.notification_preferences pref on pref.user_id=p.id
 where b.user_id=new.user_id and b.disabled_at is null and octet_length(b.subscription::text)<=8192
  and (new.data->>'category' is distinct from 'team_digest' or coalesce(pref.team_notifications,true) and coalesce(pref.team_push,false))
  and (coalesce(new.data->>'category','') not like 'calendar_%' or coalesce(pref.calendar_reminders,true) and coalesce(pref.calendar_push,true))
 order by b.created_at desc,b.id limit 10 on conflict(notification_id,subscription_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_notification_push() from public,anon,authenticated;
drop trigger if exists notification_push_after_insert on public.notifications;
create trigger notification_push_after_insert after insert on public.notifications for each row execute function public.enqueue_notification_push();

create or replace function public.claim_notification_push(p_limit integer default 20,p_audience uuid[] default null)
returns table(id uuid,lease_token uuid,notification_id uuid,subscription jsonb,endpoint text,category text)
language plpgsql security definer set search_path='' as $$
begin
 if p_limit<1 or p_limit>50 then raise exception 'Invalid batch size' using errcode='22023';end if;
 -- Bounded maintenance; read notifications are never marked unread or resent.
 update public.notification_push_deliveries q set status='skipped',lease_token=null,lease_until=null,updated_at=now()
 where q.id in(select d.id from public.notification_push_deliveries d join public.notifications n on n.id=d.notification_id
  left join public.web_push_subscriptions b on b.id=d.subscription_id
  left join public.profiles p on p.id=d.user_id
  left join public.notification_preferences pref on pref.user_id=d.user_id
  where d.status in ('pending','leased') and (n.is_read or greatest(n.created_at,d.available_at)<now()-interval '1 day'
   or b.disabled_at is not null or b.user_id is distinct from d.user_id or p.is_active is not true or p.deleted_at is not null
   or d.attempts>=4 and (d.status='pending' or d.lease_until<now())
   or n.data->>'category'='team_digest' and not(coalesce(pref.team_notifications,true) and coalesce(pref.team_push,false))
   or n.data->>'category' like 'calendar_%' and not(coalesce(pref.calendar_reminders,true) and coalesce(pref.calendar_push,true)))
   and (p_audience is null or d.user_id=any(p_audience)) order by d.created_at limit 200 for update of d skip locked);
 return query with candidates as (
  select d.id from public.notification_push_deliveries d
  join public.notifications n on n.id=d.notification_id and not coalesce(n.is_read,false)
  join public.web_push_subscriptions b on b.id=d.subscription_id and b.user_id=d.user_id and b.disabled_at is null
  join public.profiles p on p.id=d.user_id and p.is_active is true and p.deleted_at is null
  left join public.notification_preferences pref on pref.user_id=d.user_id
  where (d.status='pending' or d.status='leased' and d.lease_until<now()) and d.available_at<=now() and d.attempts<4
   and octet_length(b.subscription::text)<=8192 and (p_audience is null or d.user_id=any(p_audience))
   and (n.data->>'category' is distinct from 'team_digest' or coalesce(pref.team_notifications,true) and coalesce(pref.team_push,false))
   and (coalesce(n.data->>'category','') not like 'calendar_%' or coalesce(pref.calendar_reminders,true) and coalesce(pref.calendar_push,true))
  order by d.available_at,d.created_at,d.id limit p_limit for update of d skip locked
 ), claimed as (
  update public.notification_push_deliveries d set status='leased',attempts=d.attempts+1,
   lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
  from candidates c where d.id=c.id returning d.*
 ) select c.id,c.lease_token,c.notification_id,b.subscription,b.endpoint,n.data->>'category'
 from claimed c join public.web_push_subscriptions b on b.id=c.subscription_id join public.notifications n on n.id=c.notification_id;
end $$;
create or replace function public.finish_notification_push(p_id uuid,p_lease_token uuid,p_outcome text,p_error_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare delivery public.notification_push_deliveries;result_status text;
begin
 if p_outcome not in ('sent','retry','failed','skipped') then raise exception 'Invalid delivery outcome' using errcode='22023';end if;
 select * into delivery from public.notification_push_deliveries d where d.id=p_id and d.status='leased'
  and d.lease_token=p_lease_token and d.lease_until>=now() for update;
 if not found then return false;end if;
 result_status:=case when p_outcome='retry' and delivery.attempts<4 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end;
 update public.notification_push_deliveries set status=result_status,lease_token=null,lease_until=null,
  available_at=case when result_status='pending' then now()+make_interval(secs=>30*(2^delivery.attempts)::integer) else available_at end,
  last_error_code=left(p_error_code,40),updated_at=now() where id=p_id;
 if p_outcome='sent' then update public.web_push_subscriptions set last_success_at=now(),updated_at=now()
  where id=delivery.subscription_id and user_id=delivery.user_id;
 elsif p_error_code in ('404','410','invalid_endpoint') then update public.web_push_subscriptions set disabled_at=now(),updated_at=now()
  where id=delivery.subscription_id and user_id=delivery.user_id and updated_at<=delivery.updated_at;
 end if;
 return true;
end $$;
revoke all on function public.claim_notification_push(integer,uuid[]),public.finish_notification_push(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_notification_push(integer,uuid[]),public.finish_notification_push(uuid,uuid,text,text) to service_role;

create or replace function public.notification_team_members(p_signer uuid)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
 with recursive signer as (
  select p.id,p.office_id,p.department_id,o.kedudukan from public.profiles p join public.master_offices o on o.id=p.office_id
  where p.id=p_signer and p.is_active is true and p.deleted_at is null
 ), ancestors as (
  select o.id,o.parent_id,array[o.id] path from public.master_offices o join signer s on s.office_id=o.id where o.kedudukan in ('KC','KCP')
  union all select o.id,o.parent_id,a.path||o.id from public.master_offices o join ancestors a on a.parent_id=o.id
  where o.kedudukan in ('KC','KCP') and not(o.id=any(a.path))
 ) select p.id from public.profiles p join public.master_offices o on o.id=p.office_id cross join signer s
 where p.is_active is true and p.deleted_at is null and p.id<>s.id and (
  s.kedudukan='Pusat' and o.kedudukan='Pusat' and s.department_id is not null and p.department_id=s.department_id
  or s.kedudukan in ('KC','KCP') and (p.office_id=s.office_id or o.kedudukan='KC' and p.office_id in(select id from ancestors))
 );
$$;
revoke all on function public.notification_team_members(uuid) from public,anon,authenticated,service_role;

-- Clock injection is private to the database owner for deterministic fixtures.
-- The service entry point below always supplies the server clock.
create or replace function public.generate_notification_reminders_at(p_at timestamptz,p_audience uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record;inserted integer;total integer:=0;
begin
 for candidate in
  with users as (
   select p.id,coalesce(pref.team_notifications,true) team,coalesce(pref.calendar_reminders,true) calendar,
    coalesce(k.work_days,array[1,2,3,4,5]) work_days,coalesce(k.work_start,time '08:00') work_start,
    coalesce(k.work_end,time '17:00') work_end,coalesce(k.break_start,time '12:00') break_start,coalesce(k.break_end,time '13:00') break_end,
    coalesce(k.timezone,'Asia/Jakarta') tz
   from public.profiles p left join public.department_kpi_configs k on k.dept_id=p.department_id and k.is_active
   left join public.notification_preferences pref on pref.user_id=p.id
   where p.is_active is true and p.deleted_at is null and (p_audience is null or p.id=any(p_audience))
  ), working as (
   select u.*,(p_at at time zone tz)::date as work_day,(p_at at time zone tz)::time as work_clock from users u
   where extract(dow from p_at at time zone tz)::integer=any(u.work_days)
    and (p_at at time zone tz)::time>=work_start and (p_at at time zone tz)::time<work_end
    and not((p_at at time zone tz)::time>=break_start and (p_at at time zone tz)::time<break_end)
    and not exists(select 1 from public.holidays h where h.holiday_date=(p_at at time zone tz)::date)
  ), team_items as (
   select w.id user_id,'team_digest' category,'Pengajuan aktif di tim Anda' title,
    count(distinct sr.id)::text||' pengajuan sedang ditindaklanjuti oleh tim. Periksa progresnya di SIGAP.' message,
    '/dashboard?scope=team' link,'sigap:team:'||to_char(p_at at time zone w.tz,'YYYY-MM-DD-HH24') event_key,null::uuid entry_id
   from public.surat_registrasi sr join public.surat_signatures s on s.surat_id=sr.id and s.step_order=sr.current_step
    and not coalesce(s.is_signed,false) and s.status is distinct from 'REJECTED' and (s.available_at is null or s.available_at<=p_at)
   cross join lateral public.notification_team_members(s.user_id) recipient
   join working w on w.id=recipient.user_id and w.team where sr.status='PROSES' group by w.id,w.tz
  ), calendar_items as (
   select w.id user_id,choice.category,choice.title,'Buka Kalender Kerja untuk menindaklanjuti pekerjaan Anda.' message,
    '/calendar?date='||w.work_day::text||'&view=day&entry='||e.id::text link,
    'sigap:'||choice.category||':'||e.id::text||':'||w.work_day::text event_key,e.id entry_id
   from working w join public.work_calendar_entries e on e.owner_id=w.id and e.deleted_at is null and e.status<>'completed' and e.work_date<=w.work_day
   cross join lateral (values
    ('calendar_scheduled','Pekerjaan akan dimulai',e.starts_at>p_at and e.starts_at<=p_at+interval '15 minutes' and e.status='planned'),
    ('calendar_deadline','Pengingat tenggat pekerjaan',e.kind='work' and e.due_date is not null and e.due_date<=w.work_day and p_at at time zone w.tz>=(w.work_day+w.work_end)-interval '30 minutes'),
    ('calendar_result','Pengingat pembaruan hasil pekerjaan',e.kind='work' and nullif(btrim(e.realization),'') is null and p_at at time zone w.tz>=(w.work_day+w.work_end)-interval '30 minutes')
   ) choice(category,title,eligible) where w.calendar and choice.eligible
  ), candidates as (select * from team_items union all select * from calendar_items)
  select c.* from candidates c where not exists(select 1 from public.notifications n where n.user_id=c.user_id and n.data->>'dedupe_key'=c.event_key)
  order by c.event_key,c.user_id limit 200
 loop
  insert into public.notifications(user_id,type,title,message,link,is_read,data)
  values(candidate.user_id,'info',candidate.title,candidate.message,candidate.link,false,
   jsonb_build_object('category',candidate.category,'entry_ids',case when candidate.entry_id is null then '[]'::jsonb else jsonb_build_array(candidate.entry_id) end,'dedupe_key',candidate.event_key))
  on conflict(user_id,(data->>'dedupe_key')) where data->>'dedupe_key' like 'sigap:%' do nothing;
  get diagnostics inserted=row_count;total:=total+inserted;
 end loop;
 return total;
end $$;
revoke all on function public.generate_notification_reminders_at(timestamptz,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.generate_notification_reminders(p_audience uuid[] default null)
returns integer language sql security definer set search_path='' as $$
 select public.generate_notification_reminders_at(now(),p_audience);
$$;
revoke all on function public.generate_notification_reminders(uuid[]) from public,anon,authenticated;
grant execute on function public.generate_notification_reminders(uuid[]) to service_role;

do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.remind_dashboard_request(uuid)'::regprocedure);
 if position('public.can_monitor_surat_progress(p_surat_id)' in definition)=0 then
  if position('public.can_monitor_surat_scope(p_surat_id)' in definition)=0 then raise exception 'Unknown reminder authorization';end if;
  execute replace(definition,'public.can_monitor_surat_scope(p_surat_id)','public.can_monitor_surat_progress(p_surat_id)');
 end if;
 definition:=pg_get_functiondef('public.get_actionable_dashboard(text,text,timestamptz,timestamptz,text,integer,integer)'::regprocedure);
 if position('''can_remind'',public.can_monitor_surat_scope(id)' in definition)>0 then
  execute replace(definition,'''can_remind'',public.can_monitor_surat_scope(id)','''can_remind'',public.can_monitor_surat_progress(id)');
 elsif position('''can_remind'',public.can_monitor_surat_progress(id)' in definition)=0 then raise exception 'Unknown dashboard reminder flag';end if;
end $migration$;
notify pgrst,'reload schema';
commit;
