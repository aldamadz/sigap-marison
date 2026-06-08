create or replace function public.enforce_surat_creator_from_auth()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null then
    new.created_by := v_actor;
  elsif new.created_by is null then
    raise exception 'Tidak terautentikasi';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_creator_from_auth
on public.surat_registrasi;

create trigger trg_enforce_surat_creator_from_auth
before insert on public.surat_registrasi
for each row
execute function public.enforce_surat_creator_from_auth();

alter table public.surat_registrasi
  alter column created_by set default auth.uid();

drop policy if exists "Users can create own surat"
on public.surat_registrasi;

create policy "Users can create own surat"
on public.surat_registrasi
for insert
to authenticated
with check (
  created_by = (select auth.uid())
);
