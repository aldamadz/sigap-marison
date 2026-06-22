drop policy if exists "Users can create reservations" on public.surat_reservations;
drop policy if exists "Users can update their own reservations" on public.surat_reservations;
drop policy if exists "Users can view reservations" on public.surat_reservations;

create policy "Users can create own reservations"
  on public.surat_reservations
  for insert
  to authenticated
  with check (reserved_by = auth.uid());

create policy "Users can view own reservations"
  on public.surat_reservations
  for select
  to authenticated
  using (reserved_by = auth.uid());

create policy "Users can update own reservations"
  on public.surat_reservations
  for update
  to authenticated
  using (reserved_by = auth.uid())
  with check (reserved_by = auth.uid());
