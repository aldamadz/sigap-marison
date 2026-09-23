begin;

create or replace function public.prevent_recommendation_creator_approval_attachment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage_order = 1 and exists (
    select 1
    from public.form_usages usage
    where usage.id = new.usage_id
      and usage.name = 'Rekomendasi Peremajaan Aset'
      and usage.is_system_template is true
  ) then
    raise exception 'Lampiran rekomendasi diunggah saat penyusunan dan tidak boleh diminta ulang pada tahap pembuat.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_recommendation_creator_approval_attachment_on_write
  on public.form_usage_attachment_requirements;
create trigger prevent_recommendation_creator_approval_attachment_on_write
before insert or update of usage_id, stage_order
on public.form_usage_attachment_requirements
for each row execute function public.prevent_recommendation_creator_approval_attachment();

do $$
declare
  v_recommendation_usage_id uuid;
begin
  select usage.id
  into v_recommendation_usage_id
  from public.form_usages usage
  where usage.name = 'Rekomendasi Peremajaan Aset'
    and usage.status = 'active'
    and usage.is_system_template is true
  order by usage.updated_at desc nulls last, usage.created_at desc nulls last
  limit 1;

  if v_recommendation_usage_id is null then
    raise exception 'Template aktif Rekomendasi Peremajaan Aset belum tersedia.';
  end if;

  delete from public.form_usage_attachment_requirements requirement
  where requirement.usage_id = v_recommendation_usage_id
    and requirement.stage_order = 1;

  update public.surat_signatures signature
  set attachment_requirements_snapshot = '[]'::jsonb
  from public.surat_registrasi registration
  where registration.id = signature.surat_id
    and registration.form_usage_id = v_recommendation_usage_id
    and signature.step_order = 1
    and signature.is_signed is not true
    and signature.attachment_requirements_snapshot <> '[]'::jsonb;
end $$;

commit;
