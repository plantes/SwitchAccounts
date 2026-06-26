import type { AccountProfile, CookieSnapshot, WebStorageSnapshot } from "./models";

export function normalizeProfileName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function isEmptySnapshot(cookies: CookieSnapshot[], storage: WebStorageSnapshot): boolean {
  return cookies.length === 0
    && Object.keys(storage.localStorage).length === 0
    && Object.keys(storage.sessionStorage).length === 0;
}

export function searchProfiles(profiles: AccountProfile[], query: string): AccountProfile[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return profiles;
  return profiles.filter((profile) =>
    profile.name.toLocaleLowerCase().includes(needle)
    || profile.note.toLocaleLowerCase().includes(needle));
}

export function hasDuplicateName(
  profiles: AccountProfile[],
  registrableDomain: string,
  name: string,
  exceptId?: string,
): boolean {
  const normalizedName = normalizeProfileName(name);
  return profiles.some((profile) =>
    profile.registrableDomain === registrableDomain
    && profile.normalizedName === normalizedName
    && profile.id !== exceptId);
}
