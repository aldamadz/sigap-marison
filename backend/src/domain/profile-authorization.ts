export interface ProfileAuthorizationState {
  role?: unknown;
  is_active?: unknown;
  deleted_at?: unknown;
}

export const isActiveProfile = (profile: ProfileAuthorizationState | null | undefined): boolean => Boolean(
  profile
  && profile.is_active === true
  && profile.deleted_at == null
);

export const isActiveAdminProfile = (profile: ProfileAuthorizationState | null | undefined): boolean => (
  isActiveProfile(profile)
  && String(profile?.role || "").toLowerCase() === "admin"
);
