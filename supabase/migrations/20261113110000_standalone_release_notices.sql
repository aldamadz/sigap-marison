begin;

create table if not exists public.release_notice_state (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0),
  draft_content text not null default '' check (length(draft_content) <= 1500),
  active_release jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid
);
create table if not exists public.release_notice_events (
  revision bigint primary key,
  action text not null check (action in ('save', 'publish', 'withdraw')),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  before_state jsonb not null,
  after_state jsonb not null
);
insert into public.release_notice_state(singleton) values(true) on conflict do nothing;
alter table public.release_notice_state enable row level security;
alter table public.release_notice_events enable row level security;
revoke all on public.release_notice_state, public.release_notice_events from public, anon, authenticated;
grant select, insert, update, delete on public.release_notice_state, public.release_notice_events to service_role;

create or replace function public.get_active_release_notice()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_release jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Sesi tidak diizinkan.' using errcode='42501';
  end if;
  select active_release into v_release from public.release_notice_state where singleton;
  if v_release is not null and (v_release->>'publishedAt')::timestamptz <= v_now
    and v_now < (v_release->>'expiresAt')::timestamptz then
    return jsonb_build_object('serverNow', v_now, 'release', v_release);
  end if;
  return jsonb_build_object('serverNow', v_now, 'release', null);
end $$;

create or replace function public.get_release_notice_admin()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state public.release_notice_state; v_history jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','super_admin')
    and is_active is true and deleted_at is null) then
    raise exception 'Akses admin diperlukan.' using errcode='42501';
  end if;
  select * into strict v_state from public.release_notice_state where singleton;
  select coalesce(jsonb_agg(item order by revision desc), '[]'::jsonb) into v_history from (
    select revision, jsonb_build_object('revision',revision,'action',action,'at',created_at,
      'actorName',actor_name,'release',case when action='withdraw' then before_state->'active_release' else after_state->'active_release' end) item
    from public.release_notice_events where action in ('publish','withdraw') order by revision desc limit 20
  ) history;
  return jsonb_build_object('revision',v_state.revision,'draftContent',v_state.draft_content,
    'release',v_state.active_release,'updatedAt',v_state.updated_at,'history',v_history,'serverNow',clock_timestamp());
end $$;

create or replace function public.update_release_notice(
  p_action text, p_expected_revision bigint, p_content text default null, p_release_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_before public.release_notice_state; v_actor uuid := auth.uid(); v_name text;
  v_content text; v_now timestamptz; v_release jsonb; v_items jsonb;
begin
  select full_name into v_name from public.profiles where id=v_actor and role::text in ('admin','super_admin')
    and is_active is true and deleted_at is null;
  if not found then raise exception 'Akses admin diperlukan.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('save','publish','withdraw') then
    raise exception 'Tindakan pengumuman tidak valid.' using errcode='22023';
  end if;
  select * into strict v_before from public.release_notice_state where singleton for update;
  if p_expected_revision is null or p_expected_revision <> v_before.revision then
    raise exception 'Pengumuman telah diubah admin lain. Muat ulang dahulu.' using errcode='40001';
  end if;
  v_now := clock_timestamp();
  v_release := v_before.active_release;
  v_content := v_before.draft_content;
  if p_action in ('save','publish') then
    if p_content is null or length(p_content)>1500 or cardinality(regexp_split_to_array(p_content,E'\n'))>10 then
      raise exception 'Isi pembaruan maksimal 10 baris dan 1500 karakter.' using errcode='22023';
    end if;
    v_content := btrim(p_content,E' \t\r\n');
  end if;
  if p_action='publish' then
    if length(v_content)<5 then raise exception 'Isi pembaruan minimal 5 karakter.' using errcode='22023'; end if;
    select jsonb_agg(btrim(line,E' \t\r\n') order by ordinality) into v_items
    from regexp_split_to_table(v_content,E'\n') with ordinality lines(line,ordinality) where btrim(line,E' \t\r\n')<>'';
    v_release := jsonb_build_object('id',gen_random_uuid(),'publishedAt',v_now,
      'expiresAt',(date_trunc('day',v_now at time zone 'Asia/Jakarta')+interval '1 day') at time zone 'Asia/Jakarta',
      'items',v_items);
  elsif p_action='withdraw' then
    if p_release_id is null or v_release is null or p_release_id::text <> v_release->>'id' then
      raise exception 'Pengumuman aktif telah berubah. Muat ulang dahulu.' using errcode='40001';
    end if;
    v_release := null;
  end if;
  update public.release_notice_state set revision=revision+1, draft_content=v_content,
    active_release=v_release, updated_at=v_now, updated_by=v_actor where singleton;
  insert into public.release_notice_events(revision,action,actor_id,actor_name,created_at,before_state,after_state)
  select revision,p_action,v_actor,coalesce(v_name,'Admin'),v_now,to_jsonb(v_before),to_jsonb(state)
  from public.release_notice_state state where singleton;
  return public.get_release_notice_admin();
end $$;

revoke all on function public.get_active_release_notice(), public.get_release_notice_admin(),
  public.update_release_notice(text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.get_active_release_notice(), public.get_release_notice_admin(),
  public.update_release_notice(text,bigint,text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
