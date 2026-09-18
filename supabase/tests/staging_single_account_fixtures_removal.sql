-- REMOVAL / ARCHIVE PLAN (do NOT apply now).
-- Staging-only cleanup for split-account fixtures.
-- Targets exactly the two scoped prefixes. Legacy [UJI STAGING]% clones are
-- archived by migration 20260919000100 itself, not by this plan.
-- To use after testing: convert to a forward-only migration with a new unique
-- timestamp (greater than all applied migrations) containing the body below,
-- get Tech Lead review, then apply to staging only. Never promote to production.
--
-- Effect: archives only scope fixture clones
-- (names LIKE '[UJI STAGING PUSAT]%' or '[UJI STAGING CABANG]%').
-- Canonical workflows (without prefix) are never touched.

begin;

update public.form_usages
set status = 'archived', updated_at = clock_timestamp()
where status = 'active'
  and (name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%');

-- Optional hard cleanup (only if no surat references fixtures):
-- delete from public.form_usage_attachment_requirements where usage_id in (
--   select id from public.form_usages
--   where name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%'
-- );
-- delete from public.form_usage_step_users where usage_step_id in (
--   select s.id from public.form_usage_steps s
--   join public.form_usages u on u.id = s.usage_id
--   where u.name like '[UJI STAGING PUSAT]%' or u.name like '[UJI STAGING CABANG]%'
-- );
-- delete from public.form_usage_step_verifiers where usage_step_id in (
--   select s.id from public.form_usage_steps s
--   join public.form_usages u on u.id = s.usage_id
--   where u.name like '[UJI STAGING PUSAT]%' or u.name like '[UJI STAGING CABANG]%'
-- );
-- delete from public.form_usage_steps where usage_id in (
--   select id from public.form_usages
--   where name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%'
-- );
-- delete from public.form_usage_departments where usage_id in (
--   select id from public.form_usages
--   where name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%'
-- );
-- delete from public.form_usages
-- where name like '[UJI STAGING PUSAT]%' or name like '[UJI STAGING CABANG]%';

commit;
