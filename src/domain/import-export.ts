import type {
  AccountProfile,
  ExportBundle,
  ExportScope,
  ImportPreview,
  ProfileRepository,
} from "./models";
import { SCHEMA_VERSION } from "./models";
import { normalizeProfileName } from "./profiles";
import { ExportBundleSchema, ProfileRepositorySchema } from "./schemas";

export function selectProfiles(repository: ProfileRepository, scope: ExportScope): AccountProfile[] {
  if (scope.type === "all") return [...repository.profiles];
  if (scope.type === "site") {
    return repository.profiles.filter((profile) => profile.registrableDomain === scope.registrableDomain);
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

export function mergeImport(current: ProfileRepository, unknownBundle: unknown): ProfileRepository {
  const { bundle } = previewImport(current, unknownBundle);
  const importedByKey = new Map(bundle.profiles.map((profile) => [profileConflictKey(profile), profile]));
  const mergedProfiles = current.profiles
    .filter((profile) => !importedByKey.has(profileConflictKey(profile)))
    .concat(bundle.profiles);
  const next: ProfileRepository = { schemaVersion: SCHEMA_VERSION, profiles: mergedProfiles };
  return ProfileRepositorySchema.parse(next) as ProfileRepository;
}

function profileConflictKey(profile: Pick<AccountProfile, "registrableDomain" | "name">): string {
  return `${profile.registrableDomain}\0${normalizeProfileName(profile.name)}`;
}
