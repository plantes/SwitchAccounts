import { describe, expect, it, vi } from "vitest";
import { BackgroundOperations } from "../../src/background/operations";
import { SiteOperationLock } from "../../src/infrastructure/site-lock";
import type {
  AccountProfile,
  ChromeAdapter,
  ProfileRepository,
  WebStorageSnapshot,
} from "../../src/domain/models";

const now = "2026-06-26T00:00:00.000Z";
const storage: WebStorageSnapshot = {
  origin: "https://app.example.com",
  localStorage: { user: "a" },
  sessionStorage: {},
};

function makeDeps(options: {
  authorized?: boolean;
  requestGranted?: boolean;
  cookies?: chrome.cookies.Cookie[];
  webStorage?: WebStorageSnapshot;
  missingWebStorageResponse?: boolean;
  repository?: ProfileRepository;
  failSetCookie?: boolean;
  failWriteStorage?: boolean;
  failTabMessage?: boolean;
} = {}) {
  let repository = options.repository ?? { schemaVersion: 2 as const, profiles: [] };
  const calls: string[] = [];
  const sendTabMessage: ChromeAdapter["sendTabMessage"] = async (
    _target,
    message: Parameters<ChromeAdapter["sendTabMessage"]>[1],
  ) => {
    calls.push(`${message.command}WebStorage`);
    if (options.failTabMessage) throw new Error("Could not establish connection. Receiving end does not exist.");
    if (message.command === "read" && options.missingWebStorageResponse) return undefined;
    if (message.command === "read") return { ok: true, data: options.webStorage ?? storage };
    if (message.command === "write" && options.failWriteStorage) return { ok: false, error: { code: "WEB_STORAGE_WRITE_FAILED", message: "write failed" } };
    return { ok: true, data: true };
  };
  const executeWebStorageCommand: ChromeAdapter["executeWebStorageCommand"] = async (_target, message) => {
    calls.push(`fallback:${message.command}WebStorage`);
    if (message.command === "read") return { ok: true, data: options.webStorage ?? storage };
    return { ok: true, data: true };
  };

  const chrome = {
    getTab: vi.fn(async () => ({ id: 1, url: "https://app.example.com/page" }) as chrome.tabs.Tab),
    getDocumentTarget: vi.fn(async () => ({ tabId: 1, origin: storage.origin, documentId: "document-a" })),
    containsOrigins: vi.fn(async () => options.authorized ?? true),
    requestOrigins: vi.fn(async () => options.requestGranted ?? true),
    getCookies: vi.fn(async () => options.cookies ?? []),
    removeCookie: vi.fn(async () => { calls.push("removeCookie"); }),
    setCookie: vi.fn(async () => {
      calls.push("setCookie");
      if (options.failSetCookie) throw new Error("write failed");
      return {} as chrome.cookies.Cookie;
    }),
    reloadTab: vi.fn(async () => { calls.push("reload"); }),
    sendTabMessage: vi.fn(sendTabMessage) as ChromeAdapter["sendTabMessage"],
    executeWebStorageCommand: vi.fn(executeWebStorageCommand) as ChromeAdapter["executeWebStorageCommand"],
    getAllOrigins: vi.fn(async () => []),
    removeOrigins: vi.fn(async () => true),
  } satisfies ChromeAdapter;
  return {
    calls,
    ops: new BackgroundOperations({
      chrome,
      repository: {
        load: async () => repository,
        save: async (next) => { repository = next; },
        mutate: async (change) => { const next = change(repository); repository = next.repository; return next.result; },
        listBySite: async (registrableDomain) => repository.profiles.filter((profile) => profile.registrableDomain === registrableDomain),
        findById: async (profileId) => repository.profiles.find((profile) => profile.id === profileId),
      },
      lock: new SiteOperationLock(),
      now: () => now,
      uuid: () => "00000000-0000-4000-8000-000000000010",
    }),
    getRepository: () => repository,
    chrome,
  };
}

function profile(): AccountProfile {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Work",
    normalizedName: "work",
    registrableDomain: "example.com",
    cookies: [{
      name: "sid",
      value: "secret",
      domain: ".example.com",
      hostOnly: false,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      session: true,
      storeId: "0",
    }],
    webStorageByOrigin: { "https://app.example.com": storage },
    createdAt: now,
    updatedAt: now,
  };
}

describe("BackgroundOperations", () => {
  it("未授权时不读取站点数据", async () => {
    const { ops, chrome } = makeDeps({ authorized: false, requestGranted: false });
    const result = await ops.createProfile(1, "Work");
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(chrome.getCookies).not.toHaveBeenCalled();
  });

  it("空快照拒绝新增", async () => {
    const { ops } = makeDeps({ webStorage: { ...storage, localStorage: {} } });
    await expect(ops.createProfile(1, "Work")).resolves.toMatchObject({
      ok: false,
      error: { code: "EMPTY_SNAPSHOT" },
    });
  });

  it("删除账号不清理网站状态", async () => {
    const { ops, calls } = makeDeps({ repository: { schemaVersion: 2, profiles: [profile()] } });
    await expect(ops.deleteProfile(profile().id)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([]);
  });

  it("切换成功按清理、恢复、刷新顺序执行", async () => {
    const { ops, calls } = makeDeps({
      repository: { schemaVersion: 2, profiles: [profile()] },
      cookies: [profile().cookies[0] as unknown as chrome.cookies.Cookie],
    });
    await expect(ops.switchProfile(1, profile().id)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([
      "removeCookie",
      "clearWebStorage",
      "setCookie",
      "writeWebStorage",
      "reload",
    ]);
  });

  it("Cookie 写入失败后二次清理且不刷新", async () => {
    const { ops, calls } = makeDeps({ repository: { schemaVersion: 2, profiles: [profile()] }, failSetCookie: true });
    await expect(ops.switchProfile(1, profile().id)).resolves.toMatchObject({
      ok: false,
      error: { code: "COOKIE_WRITE_FAILED" },
    });
    expect(calls).toEqual(["clearWebStorage", "setCookie", "clearWebStorage"]);
  });

  it("切换时跳过已过期 Cookie 并继续恢复", async () => {
    const baseCookie = profile().cookies[0] as AccountProfile["cookies"][number];
    const expiredCookie: AccountProfile["cookies"][number] = {
      ...baseCookie,
      name: "expired",
      session: false,
      expirationDate: 1,
    };
    const freshCookie: AccountProfile["cookies"][number] = {
      ...baseCookie,
      name: "fresh",
    };
    const savedProfile = {
      ...profile(),
      cookies: [expiredCookie, freshCookie],
    };
    const { ops, calls, chrome } = makeDeps({
      repository: { schemaVersion: 2, profiles: [savedProfile] },
    });

    await expect(ops.switchProfile(1, savedProfile.id)).resolves.toMatchObject({ ok: true });
    expect(chrome.setCookie).toHaveBeenCalledTimes(1);
    expect(chrome.setCookie).toHaveBeenCalledWith(expect.objectContaining({ name: "fresh" }));
    expect(calls).toEqual(["clearWebStorage", "setCookie", "writeWebStorage", "reload"]);
  });

  it("content script 未响应时使用脚本 fallback 清理和恢复 Web Storage", async () => {
    const { ops, calls, chrome } = makeDeps({
      repository: { schemaVersion: 2, profiles: [profile()] },
      failTabMessage: true,
    });

    await expect(ops.switchProfile(1, profile().id)).resolves.toMatchObject({ ok: true });
    const target = { tabId: 1, origin: storage.origin, documentId: "document-a" };
    expect(chrome.executeWebStorageCommand).toHaveBeenCalledWith(target, { type: "switchaccounts:storage:v2", command: "clear", expectedOrigin: storage.origin });
    expect(chrome.executeWebStorageCommand).toHaveBeenCalledWith(target, {
      type: "switchaccounts:storage:v2", command: "write", expectedOrigin: storage.origin,
      snapshot: storage,
    });
    expect(calls).toEqual([
      "clearWebStorage",
      "fallback:clearWebStorage",
      "setCookie",
      "writeWebStorage",
      "fallback:writeWebStorage",
      "reload",
    ]);
  });

  it("重置成功清理并刷新但不改仓库", async () => {
    const existing = { schemaVersion: 2 as const, profiles: [profile()] };
    const { ops, calls, getRepository } = makeDeps({ repository: existing });
    await expect(ops.resetSite(1)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual(["clearWebStorage", "reload"]);
    expect(getRepository()).toBe(existing);
  });
});
describe("BackgroundOperations defensive browser boundaries", () => {
  it("旧内容脚本未响应时通过备用脚本读取有效快照", async () => {
    const { ops } = makeDeps({ missingWebStorageResponse: true });
    await expect(ops.createProfile(1, "Work")).resolves.toMatchObject({
      ok: true,
    });
  });
});
