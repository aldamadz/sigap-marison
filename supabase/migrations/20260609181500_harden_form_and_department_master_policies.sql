alter table public.master_departments enable row level security;
alter table public.master_forms enable row level security;
alter table public.master_penggunaan_detail enable row level security;

drop policy if exists "Allow all access for everyone" on public.master_departments;
create policy master_departments_authenticated_read
on public.master_departments for select to authenticated
using (true);
create policy master_departments_admin_insert
on public.master_departments for insert to authenticated
with check (public.is_current_user_admin());
create policy master_departments_admin_update
on public.master_departments for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
create policy master_departments_admin_delete
on public.master_departments for delete to authenticated
using (public.is_current_user_admin());

drop policy if exists "Allow public read on forms" on public.master_forms;
drop policy if exists "Enable delete for all users" on public.master_forms;
drop policy if exists "Enable insert for all users" on public.master_forms;
drop policy if exists "Enable insert for authenticated users only" on public.master_forms;
drop policy if exists "Enable read access for all users" on public.master_forms;
drop policy if exists "Enable update for all users" on public.master_forms;
create policy master_forms_authenticated_read
on public.master_forms for select to authenticated
using (true);
create policy master_forms_admin_insert
on public.master_forms for insert to authenticated
with check (public.is_current_user_admin());
create policy master_forms_admin_update
on public.master_forms for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
create policy master_forms_admin_delete
on public.master_forms for delete to authenticated
using (public.is_current_user_admin());

drop policy if exists "Allow public read on penggunaan" on public.master_penggunaan_detail;
drop policy if exists "Enable all access for authenticated users" on public.master_penggunaan_detail;
create policy master_penggunaan_detail_authenticated_read
on public.master_penggunaan_detail for select to authenticated
using (true);
create policy master_penggunaan_detail_admin_insert
on public.master_penggunaan_detail for insert to authenticated
with check (public.is_current_user_admin());
create policy master_penggunaan_detail_admin_update
on public.master_penggunaan_detail for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
create policy master_penggunaan_detail_admin_delete
on public.master_penggunaan_detail for delete to authenticated
using (public.is_current_user_admin());

