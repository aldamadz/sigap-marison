-- REMOVAL / ARCHIVE PLAN (do NOT apply now).
-- Staging-only cleanup for [UJI STAGING] single-account fixtures.
-- To use after testing: convert to a forward-only migration with a new unique
-- timestamp (greater than all applied migrations) containing the body below,
-- get Tech Lead review, then apply to staging only. Never promote to production.
--
-- Effect: archives only fixture clones (name LIKE '[UJI STAGING]%').
-- Canonical workflows (without prefix) are never touched.

begin;

update public.form_usages
set status = 'archived', updated_at = clock_timestamp()
where name like '[UJI STAGING]%'
  and status = 'active';

-- Optional hard cleanup (only if no surat references fixtures):
-- delete from public.form_usage_attachment_requirements where usage_id in (
--   select id from public.form_usages where name like '[UJI STAGING]%'
-- );
-- delete from public.form_usage_step_users where usage_step_id in (
--   select s.id from public.form_usage_steps s
--   join public.form_usages u on u.id = s.usage_id
--   where u.name like '[UJI STAGING]%'
-- );
-- delete from public.form_usage_step_verifiers where usage_step_id in (
--   select s.id from public.form_usage_steps s
--   join public.form_usages u on u.id = s.usage_id
--   where u.name like '[UJI STAGING]%'
-- );
-- delete from public.form_usage_steps where usage_id in (
--   select id from public.form_usages where name like '[UJI STAGING]%'
-- );
-- delete from public.form_usage_departments where usage_id in (
--   select id from public.form_usages where name like '[UJI STAGING]%'
-- );
-- delete from public.form_usages where name like '[UJI STAGING]%';

commit;
