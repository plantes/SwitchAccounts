import { vi } from "vitest";
import { BackgroundOperations } from "../../src/background/operations";
import { createMessageRouter } from "../../src/background/message-router";
import { ChromeProfileRepository } from "../../src/infrastructure/profile-repository";
import { SiteOperationLock } from "../../src/infrastructure/site-lock";
import type { AccountProfile, ChromeAdapter, ProfileRepository } from "../../src/domain/models";

export const now = "2026-09-06T00:00:00.000Z";
export const baseProfile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001", name: "Work", normalizedName: "work", registrableDomain: "example.com",
  cookies: [{ name: "sid", value: "old", domain: ".example.com", hostOnly: false, path: "/", secure: true, httpOnly: false, sameSite: "lax", session: true, storeId: "0" }],
  webStorageByOrigin: { "https://example.com": { origin: "https://example.com", localStorage: { user: "old" }, sessionStorage: {} } },
  createdAt: now, updatedAt: now,
};
export const secondProfile = { ...baseProfile, id: "00000000-0000-4000-8000-000000000002", name: "Home", normalizedName: "home" };

export function makeEnvironment(profiles: AccountProfile[] = [baseProfile]) {
  let state: ProfileRepository = structuredClone({ schemaVersion: 2, profiles });
  const storage = {
    get: vi.fn(async () => ({ profileRepository: structuredClone(state) })),
    set: vi.fn(async (items: { profileRepository: ProfileRepository }) => { state = structuredClone(items.profileRepository); }),
  };
  const target = { tabId: 1, documentId: "original-document", origin: "https://example.com" };
  const chrome = {
    getTab: vi.fn(async () => ({ id: 1, url: "https://example.com/" }) as chrome.tabs.Tab),
    getDocumentTarget: vi.fn(async () => target),
    containsOrigins: vi.fn(async () => true), requestOrigins: vi.fn(async () => true),
    getCookies: vi.fn(async () => structuredClone(baseProfile.cookies) as chrome.cookies.Cookie[]),
    removeCookie: vi.fn(async () => {}), setCookie: vi.fn(async () => baseProfile.cookies[0] as chrome.cookies.Cookie), reloadTab: vi.fn(async () => {}),
    sendTabMessage: vi.fn<ChromeAdapter["sendTabMessage"]>(async (_target, message) => ({ ok: true, data: message.command === "read" ? structuredClone(baseProfile.webStorageByOrigin[target.origin]) : true })),
    executeWebStorageCommand: vi.fn<ChromeAdapter["executeWebStorageCommand"]>(async () => ({ ok: true, data: true })),
    getAllOrigins: vi.fn(async () => []), removeOrigins: vi.fn(async () => true),
  } satisfies ChromeAdapter;
  const repository = new ChromeProfileRepository(storage);
  const ops = new BackgroundOperations({ chrome, repository, lock: new SiteOperationLock(), now: () => now, uuid: () => crypto.randomUUID() });
  const router = createMessageRouter(ops);
  return { ops, router, chrome, repository, storage, target, state: () => state };
}
