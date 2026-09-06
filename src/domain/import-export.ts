import type {
  AccountProfile,
  ExportBundle,
  ExportScope,
  ImportPreview,
  ProfileRepository,
} from "./models";
import { SCHEMA_VERSION } from "./models";
import { nextUpdatedAt, normalizeProfileName } from "./profiles";
import { ExportBundleSchema, ProfileRepositorySchema } from "./schemas";

export function selectProfiles(repository: ProfileRepository, scope: ExportScope): AccountProfile[] {
  if (scope.type === "all") return [...repository.profiles];
  if (scope.type === "site") {
    return repository.profiles.filter((profile) => profile.registrableDomain === scope.registrableDomain);
  }
  if (scope.type === "profiles") {
    const selectedIds = new Set(scope.profileIds);
    return repository.profiles.filter((profile) => selectedIds.has(profile.id));
  }
  return repository.profiles.filter((profile) => profile.id === scope.profileId);
}

export function buildExportBundle(profiles: AccountProfile[], exportedAt: string): ExportBundle {
  return {
    format: "switchaccounts",
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    profiles: structuredClone(profiles),
  };
}

export function previewImport(current: ProfileRepository, unknownBundle: unknown): ImportPreview {
  const bundle = ExportBundleSchema.parse(unknownBundle) as ExportBundle;
  const currentKeys = new Set(current.profiles.map(profileConflictKey));
  const incomingKeys = new Set<string>();
  let added = 0;
  let overwritten = 0;

  for (const profile of bundle.profiles) {
    const key = profileConflictKey(profile);
    if (incomingKeys.has(key)) {
      throw new Error(`Duplicate imported profile: ${profile.registrableDomain}/${profile.name}`);
    }
    incomingKeys.add(key);
    if (currentKeys.has(key)) overwritten += 1;
    else added += 1;
  }

  return {
    added,
    overwritten,
    sites: [...new Set(bundle.profiles.map((profile) => profile.registrableDomain))].sort(),
    bundle,
  };
}

export function mergeImport(current: ProfileRepository, unknownBundle: unknown, uuid: () => string = () => crypto.randomUUID(), now = new Date().toISOString()): ProfileRepository {
  const { bundle } = previewImport(current, unknownBundle);
  const importedByKey = new Map(bundle.profiles.map((profile) => [profileConflictKey(profile), profile]));
  const mergedProfiles = current.profiles.filter((profile) => !importedByKey.has(profileConflictKey(profile)));
  const existingByKey = new Map(current.profiles.map((profile) => [profileConflictKey(profile), profile]));
  const usedIds = new Set(current.profiles.map((profile) => profile.id));
  for (const incoming of bundle.profiles) {
    const existing = existingByKey.get(profileConflictKey(incoming));
    let id = existing?.id ?? incoming.id;
    if (!existing && usedIds.has(id)) {
      do { id = uuid(); } while (usedIds.has(id));
    }
    usedIds.add(id);
    mergedProfiles.push({ ...incoming, id, updatedAt: existing ? nextUpdatedAt(existing.updatedAt, now) : incoming.updatedAt });
  }
  const next: ProfileRepository = { schemaVersion: SCHEMA_VERSION, profiles: mergedProfiles };
  return ProfileRepositorySchema.parse(next) as ProfileRepository;
}

function profileConflictKey(profile: Pick<AccountProfile, "registrableDomain" | "name">): string {
  return `${profile.registrableDomain}\0${normalizeProfileName(profile.name)}`;
}
