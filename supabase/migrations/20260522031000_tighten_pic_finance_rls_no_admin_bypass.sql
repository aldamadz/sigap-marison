drop policy if exists "PIC Keuangan can insert reviews" on public.finance_reviews;
drop policy if exists "PIC Keuangan can update reviews" on public.finance_reviews;
drop policy if exists "PICs can always insert" on public.surat_chats;
drop policy if exists "System messages can be inserted by service" on public.surat_chats;

create policy "PIC Keuangan can insert reviews"
on public.finance_reviews
for insert
with check (
  exists (
    select 1
    from public.master_dept_pics mdp
    join public.master_departments md on md.id = mdp.dept_id
    where mdp.user_id = auth.uid()
      and (
        lower(coalesce(md.code, '')) = 'keu'
        or lower(coalesce(md.name, '')) like '%keuangan%'
      )
  )
);

create policy "PIC Keuangan can update reviews"
on public.finance_reviews
for update
using (
  exists (
    select 1
    from public.master_dept_pics mdp
    join public.master_departments md on md.id = mdp.dept_id
    where mdp.user_id = auth.uid()
      and (
        lower(coalesce(md.code, '')) = 'keu'
        or lower(coalesce(md.name, '')) like '%keuangan%'
      )
  )
)
with check (
  exists (
    select 1
    from public.master_dept_pics mdp
    join public.master_departments md on md.id = mdp.dept_id
    where mdp.user_id = auth.uid()
      and (
        lower(coalesce(md.code, '')) = 'keu'
        or lower(coalesce(md.name, '')) like '%keuangan%'
      )
  )
);

create policy "PICs can always insert"
on public.surat_chats
for insert
with check (
  auth.uid() = sender_id
  and (
    exists (
      select 1
      from public.surat_registrasi sr
      where sr.id = surat_chats.surat_id
        and sr.pic_id = auth.uid()
    )
    or public.is_surat_department_pic(surat_chats.surat_id, auth.uid())
  )
);

create policy "System messages can be inserted by authorized PIC"
on public.surat_chats
for insert
with check (
  is_system = true
  and (
    sender_id = auth.uid()
    or sender_id is null
  )
  and public.is_surat_department_pic(surat_id, auth.uid())
);
