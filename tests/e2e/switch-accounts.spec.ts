import { test, expect, type AccountProfile, type ExportBundle } from "./fixtures";
import type { BackgroundRequest, OperationResult } from "../../src/domain/models";

test("saves, switches, resets, exports and imports browser login states", async ({ site, extension }) => {
  const page = await extension.context.newPage();

  await setAccount(page, site.url("/set?account=A"));
  await page.goto(site.url("/state"));
  const tabId = await extension.tabIdFor(`example.test:${site.port}`);
  await waitForContentScript(extension, tabId);

  const createdA = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Account A" });
  expect(createdA.ok).toBe(true);
  if (!createdA.ok) throw new Error(createdA.error.message);

  await setAccount(page, site.url("/set?account=B"));
  await page.goto(site.url("/state"));

  const createdB = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Account B" });
  expect(createdB.ok).toBe(true);
  if (!createdB.ok) throw new Error(createdB.error.message);

  await expectProfiles(extension, ["Account A", "Account B"]);

  const switchToA = await extension.send<{ profileId: string }>({ type: "switchProfile", tabId, profileId: createdA.data.id });
  expect(switchToA.ok).toBe(true);
  await page.waitForLoadState("load");
  await expectMainState(page, "A");

  const subdomain = await extension.context.newPage();
  await subdomain.goto(site.url("/state", "sub.example.test"));
  await expect(subdomain.locator("#server-cookies")).toContainText("domain_account=A");
  await expect(subdomain.locator("#server-cookies")).not.toContainText("host_account=A");
  await subdomain.close();

  const switchToB = await extension.send<{ profileId: string }>({ type: "switchProfile", tabId, profileId: createdB.data.id });
  expect(switchToB.ok).toBe(true);
  await page.waitForLoadState("load");
  await expectMainState(page, "B");

  const reset = await extension.send<{ tabId: number }>({ type: "resetSite", tabId });
  expect(reset.ok).toBe(true);
  await page.waitForLoadState("load");
  await expectMainState(page, "");
  await expectProfiles(extension, ["Account A", "Account B"]);

  const exported = await extension.send<ExportBundle>({ type: "exportProfiles", scope: { type: "all" } });
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.message);
  expect(exported.data.profiles).toHaveLength(2);

  await extension.extensionPage.evaluate(() => chrome.storage.local.clear());
  await expectProfiles(extension, []);

  const imported = await extension.send({ type: "importProfiles", bundle: exported.data });
  expect(imported.ok).toBe(true);
  await expectProfiles(extension, ["Account A", "Account B"]);
});

async function setAccount(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.local === document.querySelector("h1")?.textContent?.replace("Account ", ""));
}

async function expectMainState(page: import("@playwright/test").Page, account: string) {
  await page.waitForLoadState("load").catch(() => undefined);
  const cookies = page.locator("#server-cookies");
  if (account) {
    await expect(cookies).toContainText(`domain_account=${account}`);
    await expect(cookies).toContainText(`host_account=${account}`);
    await expect(cookies).toContainText(`http_only_account=${account}`);
  } else {
    await expect(cookies).not.toContainText("domain_account=");
    await expect(cookies).not.toContainText("host_account=");
    await expect(cookies).not.toContainText("http_only_account=");
  }
  await expect(page.locator("body")).toHaveAttribute("data-local", account);
  await expect(page.locator("body")).toHaveAttribute("data-session", account);
}

async function waitForContentScript(extension: { extensionPage: import("@playwright/test").Page }, tabId: number) {
  await expect.poll(() => extension.extensionPage.evaluate(async (id) => {
    try {
      const snapshot = await chrome.tabs.sendMessage(id, { type: "readWebStorage" });
      return Boolean(snapshot?.origin);
    } catch {
      return false;
    }
  }, tabId)).toBe(true);
}

async function expectProfiles(extension: { send: <T>(request: BackgroundRequest) => Promise<OperationResult<T>> }, names: string[]) {
  const result = await extension.send<AccountProfile[]>({ type: "listAllProfiles" });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.data.map((profile) => profile.name).sort()).toEqual([...names].sort());
}
