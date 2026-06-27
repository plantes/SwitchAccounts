import { describe, expect, it } from "vitest";
import {
  buildExportBundle,
  mergeImport,
  previewImport,
  selectProfiles,
} from "../../src/domain/import-export";
import type { AccountProfile, ProfileRepository } from "../../src/domain/models";

const baseProfile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Work",
  normalizedName: "work",
  registrableDomain: "example.com",
  cookies: [],
  webStorageByOrigin: {},
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

const repo: ProfileRepository = { schemaVersion: 2, profiles: [baseProfile] };

describe("import-export", () => {
  it("按站点和账号筛选导出", () => {
    expect(selectProfiles(repo, { type: "site", registrableDomain: "example.com" })).toHaveLength(1);
    expect(selectProfiles(repo, { type: "profile", profileId: baseProfile.id })[0]?.name).toBe("Work");
  });

  it("构造带格式版本和时间的导出包", () => {
    expect(buildExportBundle(repo.profiles, "2026-06-26T00:00:00.000Z")).toMatchObject({
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: "2026-06-26T00:00:00.000Z",
    });
  });

  it("预览导入新增和覆盖数量", () => {
    const incoming = buildExportBundle([
      { ...baseProfile },
      {
        ...baseProfile,
        id: "00000000-0000-4000-8000-000000000002",
        name: "Home",
        normalizedName: "home",
      },
    ], "2026-06-26T00:00:00.000Z");
    expect(previewImport(repo, incoming)).toMatchObject({
      added: 1,
      overwritten: 1,
      sites: ["example.com"],
    });
    expect(mergeImport(repo, incoming).profiles).toHaveLength(2);
  });

  it("拒绝含旧字段的导出包", () => {
    expect(() => previewImport(repo, {
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: "2026-06-26T00:00:00.000Z",
      profiles: [{ ...baseProfile, ["no" + "te"]: "legacy" }],
    })).toThrow();
  });

  it("任一非法配置导致整批拒绝", () => {
    expect(() => previewImport(repo, { format: "switchaccounts", schemaVersion: 2 })).toThrow();
  });
});
