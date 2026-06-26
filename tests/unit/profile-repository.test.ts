import { describe, expect, it, vi } from "vitest";
import { ChromeProfileRepository } from "../../src/infrastructure/profile-repository";
import type { ProfileRepository } from "../../src/domain/models";

function makeStorage(initial?: ProfileRepository, failSet = false) {
  let value = initial;
  return {
    get: vi.fn(async () => ({ profileRepository: value })),
    set: vi.fn(async (items: { profileRepository: ProfileRepository }) => {
      if (failSet) throw new Error("disk full");
      value = items.profileRepository;
    }),
    current: () => value,
  };
}

describe("ChromeProfileRepository", () => {
  it("空存储返回空仓库", async () => {
    const repo = new ChromeProfileRepository(makeStorage());
    await expect(repo.load()).resolves.toEqual({ schemaVersion: 1, profiles: [] });
  });

  it("写入失败时不改变已有仓库", async () => {
    const initial = { schemaVersion: 1 as const, profiles: [] };
    const storage = makeStorage(initial, true);
    const repo = new ChromeProfileRepository(storage);
    await expect(repo.save({ schemaVersion: 1, profiles: [] })).rejects.toMatchObject({
      code: "STORAGE_WRITE_FAILED",
    });
    expect(storage.current()).toBe(initial);
  });
});
