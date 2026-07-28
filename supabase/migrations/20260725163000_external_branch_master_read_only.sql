-- master_offices adalah mirror read-only dari endpoint Get All Branches Marison.
-- Service role server tetap dapat melakukan sinkronisasi karena melewati RLS.
drop policy if exists master_offices_admin_insert on public.master_offices;
drop policy if exists master_offices_admin_update on public.master_offices;
drop policy if exists master_offices_admin_delete on public.master_offices;

comment on table public.master_offices is
  'Mirror read-only kantor cabang dari Marison External API; perubahan hanya melalui sinkronisasi server.';
