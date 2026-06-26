import { describe, expect, it } from "vitest";
import {
  cookieRemovalDetails,
  fromChromeCookie,
  toSetDetails,
  validateCookieDomain,
} from "../../src/domain/cookies";
import type { CookieSnapshot } from "../../src/domain/models";

const baseCookie: CookieSnapshot = {
  name: "sid",
  value: "secret",
  domain: "app.example.com",
  hostOnly: true,
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
  session: true,
  storeId: "0",
};

describe("cookie snapshots", () => {
  it("host-only Cookie 恢复时不传 domain", () => {
    expect(toSetDetails(baseCookie)).toEqual({
      url: "https://app.example.com/",
      name: "sid",
      value: "secret",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      storeId: "0",
    });
  });

  it("domain 持久 Cookie 保留可恢复属性", () => {
    expect(toSetDetails({
      ...baseCookie,
      domain: ".example.com",
      hostOnly: false,
      session: false,
      expirationDate: 2_000_000_000,
      partitionKey: { topLevelSite: "https://example.com" },
    })).toMatchObject({
      domain: ".example.com",
      expirationDate: 2_000_000_000,
      partitionKey: { topLevelSite: "https://example.com" },
    });
  });

  it("移除 Cookie 时传递 storeId 和 partitionKey", () => {
    expect(cookieRemovalDetails({
      ...baseCookie,
      partitionKey: { topLevelSite: "https://example.com" },
    })).toEqual({
      url: "https://app.example.com/",
      name: "sid",
      storeId: "0",
      partitionKey: { topLevelSite: "https://example.com" },
    });
  });

  it("从 Chrome Cookie 删除不支持的属性以外均保留", () => {
    const snapshot = fromChromeCookie({
      ...baseCookie,
      domain: ".example.com",
    } as chrome.cookies.Cookie);
    expect(snapshot.value).toBe("secret");
    expect(snapshot.domain).toBe(".example.com");
  });

  it("拒绝注册域范围外的 Cookie", () => {
    expect(validateCookieDomain(".sub.example.com", "example.com")).toBe(true);
    expect(validateCookieDomain("evil.com", "example.com")).toBe(false);
  });
});
