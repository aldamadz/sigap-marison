begin;
insert into auth.users(id,encrypted_password) values
 ('10000000-0000-4000-8000-000000000001','private-test-hash'),
 ('10000000-0000-4000-8000-000000000002','other-test-hash');
insert into public.profiles(id,full_name,is_active) values
 ('10000000-0000-4000-8000-000000000001','Tester',true),
 ('10000000-0000-4000-8000-000000000002','Other',true);

do $$
declare u uuid:='10000000-0000-4000-8000-000000000001'; v_id uuid; r jsonb; sid uuid;
begin
 if has_table_privilege('authenticated','public.desktop_device_sessions','select')
   or has_table_privilege('anon','public.desktop_pairing_requests','insert')
   or has_function_privilege('authenticated','public.desktop_pair_exchange(text,text,text,text)','execute')
   or has_function_privilege('anon','public.desktop_authenticate(text)','execute')
   then raise exception 'Desktop state exposed through Data API'; end if;
 if not (select bool_and(relrowsecurity) from pg_class where oid in
   ('public.desktop_pairing_requests'::regclass,'public.desktop_device_sessions'::regclass,'public.desktop_refresh_history'::regclass))
   then raise exception 'RLS missing'; end if;

 insert into public.desktop_pairing_requests(device_code_hash,confirmation_hash,challenge,installation_id,device_name,platform)
 values(repeat('a',64),'confirmation','challenge',gen_random_uuid(),'Test Windows','windows') returning desktop_pairing_requests.id into v_id;
 r:=public.desktop_pair_exchange(repeat('a',64),'wrong',repeat('b',64),repeat('c',64));
 if r->>'error'<>'invalid_grant' then raise exception 'PKCE bypass'; end if;
 r:=public.desktop_pair_exchange(repeat('a',64),'challenge',repeat('b',64),repeat('c',64));
 if r->>'error'<>'authorization_pending' then raise exception 'Pre-consent token'; end if;
 r:=public.desktop_pair_decide(v_id,u,'bad',true);
 if r->>'error'<>'invalid_confirmation' or (select failed_attempts from public.desktop_pairing_requests where desktop_pairing_requests.id=v_id)<>1
   then raise exception 'Confirmation bypass'; end if;
 r:=public.desktop_pair_decide(v_id,u,'confirmation',true);
 if not (r->>'ok')::boolean then raise exception 'Consent failed'; end if;
 r:=public.desktop_pair_exchange(repeat('a',64),'challenge',repeat('b',64),repeat('c',64));
 if r->>'error'<>'slow_down' then raise exception 'Poll throttle failed'; end if;
 update public.desktop_pairing_requests set last_polled_at=now()-interval '6 seconds' where desktop_pairing_requests.id=v_id;
 r:=public.desktop_pair_exchange(repeat('a',64),'challenge',repeat('b',64),repeat('c',64));
 sid:=(r->>'session_id')::uuid;
 if sid is null or r->>'user_id'<>u::text then raise exception 'Exchange failed'; end if;
 r:=public.desktop_pair_exchange(repeat('a',64),'challenge',repeat('d',64),repeat('e',64));
 if r->>'error'<>'expired_request' then raise exception 'Double exchange allowed'; end if;
 if public.desktop_authenticate(repeat('b',64))->>'user_id'<>u::text then raise exception 'Device identity missing'; end if;
 if public.desktop_authenticate(repeat('z',64)) is not null then raise exception 'Random bearer accepted'; end if;
 update public.profiles set is_active=false where profiles.id=u;
 if public.desktop_authenticate(repeat('b',64)) is not null then raise exception 'Disabled account accepted'; end if;
 update public.profiles set is_active=true where profiles.id=u;
 update auth.users set banned_until=now()+interval '1 day' where users.id=u;
 if public.desktop_authenticate(repeat('b',64)) is not null then raise exception 'Banned account accepted'; end if;
 update auth.users set banned_until=null where users.id=u;
 update auth.users set encrypted_password='password-reset' where users.id=u;
 if public.desktop_authenticate(repeat('b',64)) is not null then raise exception 'Password reset left session active'; end if;
 r:=public.desktop_refresh_session(repeat('c',64),repeat('d',64),repeat('e',64));
 if r->>'error'<>'invalid_session' then raise exception 'Password reset refresh bypass'; end if;
 update auth.users set encrypted_password='private-test-hash' where users.id=u;
 r:=public.desktop_refresh_session(repeat('c',64),repeat('d',64),repeat('e',64));
 if r->>'session_id'<>sid::text then raise exception 'Refresh failed'; end if;
 if public.desktop_authenticate(repeat('b',64)) is not null then raise exception 'Old access accepted after rotation'; end if;
 if public.desktop_authenticate(repeat('d',64)) is null then raise exception 'Rotated access rejected'; end if;
 r:=public.desktop_refresh_session(repeat('c',64),repeat('f',64),repeat('1',64));
 if r->>'error'<>'refresh_token_reuse' then raise exception 'Refresh replay accepted'; end if;
 if public.desktop_authenticate(repeat('d',64)) is not null then raise exception 'Reuse revocation rolled back'; end if;

 -- Denial, expiry and confirmation lockout remain terminal.
 insert into public.desktop_pairing_requests(device_code_hash,confirmation_hash,challenge,installation_id,device_name,platform)
 values(repeat('2',64),'confirmation','challenge',gen_random_uuid(),'Test Mac','macos') returning desktop_pairing_requests.id into v_id;
 r:=public.desktop_pair_decide(v_id,u,'confirmation',false);
 r:=public.desktop_pair_exchange(repeat('2',64),'challenge',repeat('3',64),repeat('4',64));
 if r->>'error'<>'access_denied' then raise exception 'Denial bypass'; end if;
 update public.desktop_pairing_requests set status='pending',failed_attempts=5 where desktop_pairing_requests.id=v_id;
 r:=public.desktop_pair_decide(v_id,u,'confirmation',true);
 if r->>'error'<>'expired_request' then raise exception 'Confirmation lockout bypass'; end if;
 update public.desktop_pairing_requests set failed_attempts=0,expires_at=now()-interval '1 second' where desktop_pairing_requests.id=v_id;
 r:=public.desktop_pair_decide(v_id,u,'confirmation',true);
 if r->>'error'<>'expired_request' then raise exception 'Expired consent bypass'; end if;
 raise notice 'Desktop sessions: all assertions passed';
end $$;
rollback;
