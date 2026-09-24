-- Outbound links are revocable but intentionally do not expire. Keep the
-- current consume_file_view_token implementation and its authorization rules.
alter table public.file_view_tokens
  alter column expires_at drop not null;
