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
  repository?: ProfileRepository;
  failSetCookie?: boolean;
  failWriteStorage?: boolean;
} = {}) {
  let repository = options.repository ?? { schemaVersion: 1 as const, profiles: [] };
  const calls: string[] = [];
  const sendTabMessage: ChromeAdapter["sendTabMessage"] = async <T,>(
    _tabId: number,
    message: Parameters<ChromeAdapter["sendTabMessage"]>[1],
  ): Promise<T> => {
    calls.push(message.type);
    if (message.type === "readWebStorage") return (options.webStorage ?? storage) as T;
    if (message.type === "writeWebStorage" && options.failWriteStorage) throw new Error("write failed");
    return { ok: true } as T;
  };

  const chrome = {
    getTab: vi.fn(async () => ({ id: 1, url: "https://app.example.com/page" }) as chrome.tabs.Tab),
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
    note: "",
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
    const { ops, calls } = makeDeps({ repository: { schemaVersion: 1, profiles: [profile()] } });
    await expect(ops.deleteProfile(profile().id)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual([]);
  });

  it("切换成功按清理、恢复、刷新顺序执行", async () => {
    const { ops, calls } = makeDeps({
      repository: { schemaVersion: 1, profiles: [profile()] },
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
    const { ops, calls } = makeDeps({ repository: { schemaVersion: 1, profiles: [profile()] }, failSetCookie: true });
    await expect(ops.switchProfile(1, profile().id)).resolves.toMatchObject({
      ok: false,
      error: { code: "COOKIE_WRITE_FAILED" },
    });
    expect(calls).toEqual(["clearWebStorage", "setCookie", "clearWebStorage"]);
  });

  it("重置成功清理并刷新但不改仓库", async () => {
    const existing = { schemaVersion: 1 as const, profiles: [profile()] };
    const { ops, calls, getRepository } = makeDeps({ repository: existing });
    await expect(ops.resetSite(1)).resolves.toMatchObject({ ok: true });
    expect(calls).toEqual(["clearWebStorage", "reload"]);
    expect(getRepository()).toBe(existing);
  });
});
