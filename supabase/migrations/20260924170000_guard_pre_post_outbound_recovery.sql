create or replace function public.guard_marison_outbound_pre_post_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.post_started_at is not null
     or old.response is not null
     or old.external_reference is not null then
    raise exception 'Only a terminal pre-POST dispatch can be reopened safely' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_marison_outbound_pre_post_reopen on public.marison_outbound_dispatches;
create trigger guard_marison_outbound_pre_post_reopen
before update of status on public.marison_outbound_dispatches
for each row
when (old.status = 'failed_terminal' and new.status = 'pending')
execute function public.guard_marison_outbound_pre_post_reopen();

revoke execute on function public.guard_marison_outbound_pre_post_reopen() from public, anon, authenticated;
