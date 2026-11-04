-- AUTH-09: private device pairing. Only the BFF service role can call these RPCs.
begin;

create table public.desktop_pairing_requests (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique check (device_code_hash ~ '^[0-9a-f]{64}$'),
  confirmation_hash text not null,
  challenge text not null,
  installation_id uuid not null,
  device_name text not null check (length(device_name) between 1 and 100),
  platform text not null check (platform in ('windows','macos')),
  status text not null default 'pending' check (status in ('pending','approved','denied','consumed')),
  user_id uuid references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  decided_at timestamptz
);

create table public.desktop_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  device_name text not null,
  platform text not null check (platform in ('windows','macos')),
  access_hash text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  refresh_hash text not null unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  credential_fingerprint text not null,
  access_expires_at timestamptz not null default now() + interval '10 minutes',
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text
);
create index desktop_device_sessions_owner on public.desktop_device_sessions(user_id, created_at desc);

-- Retained hashes identify a reused refresh token without retaining its plaintext.
create table public.desktop_refresh_history (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  session_id uuid not null references public.desktop_device_sessions(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index desktop_refresh_history_session on public.desktop_refresh_history(session_id);
create index desktop_pairing_requests_expiry on public.desktop_pairing_requests(expires_at);
create index if not exists notifications_desktop_page on public.notifications(user_id, created_at desc, id desc);

alter table public.desktop_pairing_requests enable row level security;
alter table public.desktop_device_sessions enable row level security;
alter table public.desktop_refresh_history enable row level security;
revoke all on public.desktop_pairing_requests, public.desktop_device_sessions, public.desktop_refresh_history from public, anon, authenticated;
grant select, insert, update, delete on public.desktop_pairing_requests, public.desktop_device_sessions, public.desktop_refresh_history to service_role;

create function public.desktop_profile_active(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_user and p.is_active is true and p.deleted_at is null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until < now()));
$$;

create function public.desktop_pair_decide(p_id uuid, p_actor uuid, p_confirmation_hash text, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.desktop_pairing_requests;
begin
  if not public.desktop_profile_active(p_actor) then return jsonb_build_object('error','invalid_session'); end if;
  select * into r from public.desktop_pairing_requests where id=p_id for update;
  if not found or r.status <> 'pending' or r.expires_at <= now() or r.failed_attempts >= 5
    then return jsonb_build_object('error','expired_request'); end if;
  if r.confirmation_hash <> p_confirmation_hash then
    update public.desktop_pairing_requests set failed_attempts=failed_attempts+1 where id=r.id;
    return jsonb_build_object('error','invalid_confirmation');
  end if;
  update public.desktop_pairing_requests set status=case when p_approve then 'approved' else 'denied' end,
    user_id=p_actor, decided_at=now() where id=r.id;
  return jsonb_build_object('ok',true);
end $$;

create function public.desktop_pair_exchange(p_device_hash text, p_challenge text, p_access_hash text, p_refresh_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.desktop_pairing_requests; s public.desktop_device_sessions;
begin
  select * into r from public.desktop_pairing_requests where device_code_hash=p_device_hash for update;
  if not found or r.challenge <> p_challenge then return jsonb_build_object('error','invalid_grant'); end if;
  if r.expires_at <= now() or r.status='consumed' then return jsonb_build_object('error','expired_request'); end if;
  if r.last_polled_at > now()-interval '5 seconds' then return jsonb_build_object('error','slow_down'); end if;
  update public.desktop_pairing_requests set last_polled_at=now() where id=r.id;
  if r.status='denied' then return jsonb_build_object('error','access_denied'); end if;
  if r.status='pending' then return jsonb_build_object('error','authorization_pending'); end if;
  if not public.desktop_profile_active(r.user_id) then return jsonb_build_object('error','invalid_session'); end if;
  -- Installation ID is metadata, not authority: do not revoke another session by that ID.
  insert into public.desktop_device_sessions(user_id,installation_id,device_name,platform,access_hash,refresh_hash,credential_fingerprint)
    values(r.user_id,r.installation_id,r.device_name,r.platform,p_access_hash,p_refresh_hash,
      (select md5(coalesce(u.encrypted_password,'')) from auth.users u where u.id=r.user_id)) returning * into s;
  insert into public.desktop_refresh_history(token_hash,session_id) values(p_refresh_hash,s.id);
  update public.desktop_pairing_requests set status='consumed' where id=r.id;
  return jsonb_build_object('session_id',s.id,'user_id',s.user_id,'expires_at',s.expires_at);
end $$;

create function public.desktop_refresh_session(p_old_hash text, p_access_hash text, p_refresh_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid; s public.desktop_device_sessions;
begin
  select session_id into sid from public.desktop_refresh_history where token_hash=p_old_hash;
  if sid is null then return jsonb_build_object('error','invalid_grant'); end if;
  select * into s from public.desktop_device_sessions where id=sid for update;
  if s.revoked_at is not null or s.expires_at <= now() or not public.desktop_profile_active(s.user_id)
    or s.credential_fingerprint is distinct from (select md5(coalesce(u.encrypted_password,'')) from auth.users u where u.id=s.user_id)
    then return jsonb_build_object('error','invalid_session'); end if;
  if s.refresh_hash <> p_old_hash then
    update public.desktop_device_sessions set revoked_at=now(), revocation_reason='refresh_token_reuse' where id=s.id;
    -- Return, do not raise: revocation must commit even when the caller receives 401.
    return jsonb_build_object('error','refresh_token_reuse');
  end if;
  update public.desktop_device_sessions set access_hash=p_access_hash,refresh_hash=p_refresh_hash,
    access_expires_at=least(now()+interval '10 minutes',expires_at),refreshed_at=now() where id=s.id;
  insert into public.desktop_refresh_history(token_hash,session_id) values(p_refresh_hash,s.id);
  return jsonb_build_object('session_id',s.id,'user_id',s.user_id,'expires_at',s.expires_at);
end $$;

create function public.desktop_authenticate(p_access_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('session_id',s.id,'user_id',s.user_id,'device_name',s.device_name,
    'expires_at',s.expires_at,'full_name',p.full_name)
  from public.desktop_device_sessions s join public.profiles p on p.id=s.user_id
  where s.access_hash=p_access_hash and s.revoked_at is null and s.access_expires_at>now()
    and s.expires_at>now() and public.desktop_profile_active(s.user_id)
    and s.credential_fingerprint = (select md5(coalesce(u.encrypted_password,'')) from auth.users u where u.id=s.user_id);
$$;

revoke all on function public.desktop_profile_active(uuid),
  public.desktop_pair_decide(uuid,uuid,text,boolean), public.desktop_pair_exchange(text,text,text,text),
  public.desktop_refresh_session(text,text,text), public.desktop_authenticate(text) from public, anon, authenticated;
grant execute on function public.desktop_profile_active(uuid),
  public.desktop_pair_decide(uuid,uuid,text,boolean), public.desktop_pair_exchange(text,text,text,text),
  public.desktop_refresh_session(text,text,text), public.desktop_authenticate(text) to service_role;
notify pgrst, 'reload schema';
commit;
