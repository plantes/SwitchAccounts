import { describe, expect, it } from "vitest";
import {
  isEmptySnapshot,
  normalizeProfileName,
  searchProfiles,
} from "../../src/domain/profiles";
import type { AccountProfile, WebStorageSnapshot } from "../../src/domain/models";

const storage: WebStorageSnapshot = {
  origin: "https://example.com",
  localStorage: {},
  sessionStorage: {},
};

const profile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "工作账号",
  normalizedName: "工作账号",
  note: "团队",
  registrableDomain: "example.com",
  cookies: [],
  webStorageByOrigin: {},
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

describe("profile rules", () => {
  it("规范化名称", () => {
    expect(normalizeProfileName("  Work  ")).toBe("work");
  });

  it("三类存储均空时为空快照", () => {
    expect(isEmptySnapshot([], storage)).toBe(true);
    expect(isEmptySnapshot([], { ...storage, localStorage: { account: "a" } })).toBe(false);
  });

  it("搜索名称和备注但不搜索敏感值", () => {
    const withSecret = {
      ...profile,
      cookies: [{
        name: "sid", value: "secret-cookie-value", domain: "example.com",
        hostOnly: true, path: "/", secure: true, httpOnly: true,
        sameSite: "lax" as const, session: true, storeId: "0",
      }],
    };
    expect(searchProfiles([withSecret], "团队")).toHaveLength(1);
    expect(searchProfiles([withSecret], "secret-cookie-value")).toEqual([]);
  });
});
