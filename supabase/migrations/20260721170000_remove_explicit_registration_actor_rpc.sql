-- Registration now uses the authenticated user's JWT through the BFF.
-- Remove the temporary service-role actor override so there is only one submit path.
drop function if exists public.create_surat_registrasi_for_actor(jsonb, uuid);
