alter table public.profiles
  add column if not exists theme_preference text not null default 'system'
  check (theme_preference in ('light', 'dark', 'system'));

comment on column public.profiles.theme_preference is
  'User interface theme preference synchronized across devices.';
