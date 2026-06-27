import { describe, expect, it } from "vitest";
import { ExportBundleSchema } from "../../src/domain/schemas";

const validProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "A",
  normalizedName: "a",
  registrableDomain: "example.com",
  cookies: [],
  webStorageByOrigin: {},
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

describe("ExportBundleSchema", () => {
  it("拒绝未知格式版本", () => {
    expect(ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      profiles: [],
    }).success).toBe(false);
  });

  it("拒绝旧版本和旧账号字段", () => {
    expect(ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profiles: [validProfile],
    }).success).toBe(false);

    expect(ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      profiles: [{ ...validProfile, ["no" + "te"]: "" }],
    }).success).toBe(false);
  });

  it("拒绝 SameSite=None 且 Secure=false 的 Cookie", () => {
    const result = ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      profiles: [{
        ...validProfile,
        cookies: [{
          name: "sid", value: "secret", domain: ".example.com",
          hostOnly: false, path: "/", secure: false, httpOnly: true,
          sameSite: "no_restriction", session: true, storeId: "0",
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it("拒绝 Web Storage key 与 origin 不一致", () => {
    const result = ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      profiles: [{
        ...validProfile,
        webStorageByOrigin: {
          "https://example.com": {
            origin: "https://other.example.com",
            localStorage: {},
            sessionStorage: {},
          },
        },
      }],
    });
    expect(result.success).toBe(false);
  });
});
