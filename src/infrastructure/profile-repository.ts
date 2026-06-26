import type { AccountProfile, OperationError, ProfileRepository } from "../domain/models";
import { SCHEMA_VERSION } from "../domain/models";
import { ProfileRepositorySchema } from "../domain/schemas";

const STORAGE_KEY = "profileRepository";

export interface ProfileRepositoryStore {
  load(): Promise<ProfileRepository>;
  save(repository: ProfileRepository): Promise<void>;
  listBySite(registrableDomain: string): Promise<AccountProfile[]>;
  findById(profileId: string): Promise<AccountProfile | undefined>;
}

type StorageArea = Pick<chrome.storage.StorageArea, "get" | "set">;

export class ChromeProfileRepository implements ProfileRepositoryStore {
  constructor(private readonly storage: StorageArea = chrome.storage.local) {}

  async load(): Promise<ProfileRepository> {
    const items = await this.storage.get(STORAGE_KEY);
    const value = (items as Record<string, unknown>)[STORAGE_KEY];
    if (value === undefined) {
      return { schemaVersion: SCHEMA_VERSION, profiles: [] };
    }
    return ProfileRepositorySchema.parse(value) as ProfileRepository;
  }

  async save(repository: ProfileRepository): Promise<void> {
    const parsed = ProfileRepositorySchema.parse(repository) as ProfileRepository;
    try {
      await this.storage.set({ [STORAGE_KEY]: parsed });
    } catch (cause) {
      const error: OperationError = {
        code: "STORAGE_WRITE_FAILED",
        message: "账号配置写入失败。",
        details: cause instanceof Error ? cause.message : String(cause),
      };
      throw error;
    }
  }

  async listBySite(registrableDomain: string): Promise<AccountProfile[]> {
    const repository = await this.load();
    return repository.profiles.filter((profile) => profile.registrableDomain === registrableDomain);
  }

  async findById(profileId: string): Promise<AccountProfile | undefined> {
    const repository = await this.load();
    return repository.profiles.find((profile) => profile.id === profileId);
  }
}
