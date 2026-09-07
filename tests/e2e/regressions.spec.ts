import { test, expect, type AccountProfile } from "./fixtures";

test("侧边栏中文改名按回车或失焦后持久保存，快照保持完整", async ({ site, extension }) => {
  const page = await extension.context.newPage();
  await page.goto(site.url("/set?account=A"));
  const tabId = await extension.tabIdFor(`example.test:${site.port}`);
  const created = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "旧手机" });
  if (!created.ok) throw new Error(created.error.message);
  const panel = await extension.context.newPage();
  await panel.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);
  await page.bringToFront();
  const title = panel.getByLabel("修改账号标题 旧手机", { exact: true });
  await title.fill("旧手机-无法");
  await title.press("Enter");
  await expect(panel.getByLabel("修改账号标题 旧手机-无法", { exact: true })).toHaveValue("旧手机-无法");
  await panel.reload();
  const savedTitle = panel.getByLabel("修改账号标题 旧手机-无法", { exact: true });
  await expect(savedTitle).toHaveValue("旧手机-无法");
  await savedTitle.fill("旧手机-已恢复");
  await panel.getByLabel("搜索账号").click();
  await expect(panel.getByLabel("修改账号标题 旧手机-已恢复", { exact: true })).toHaveValue("旧手机-已恢复");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  const stored = await extension.send<AccountProfile[]>({ type: "listAllProfiles" });
  expect(stored.ok && stored.data).toEqual([{
    ...created.data, name: "旧手机-已恢复", normalizedName: "旧手机-已恢复", updatedAt: expect.any(String),
  }]);
});

for (const fallback of [false, true]) {
test(`分区 Cookie、无名 Cookie 和特殊存储键完整往返，fallback=${fallback}`, async ({ site, extension }) => {
  const page = await extension.context.newPage();
  await page.goto(site.url("/state"));
  const tabId = await extension.tabIdFor(`example.test:${site.port}`);
  await page.evaluate(() => { localStorage.setItem("__proto__", "local"); sessionStorage.setItem("__proto__", "session"); });
  await extension.extensionPage.evaluate(async () => {
    await chrome.cookies.set({ url: "https://example.test/", name: "", value: "unnamed", secure: true });
    await chrome.cookies.set({ url: "https://sub.example.test/", name: "partitioned", value: "account-a", secure: true, sameSite: "no_restriction", partitionKey: { topLevelSite: "https://example.test", hasCrossSiteAncestor: false } });
    await chrome.cookies.set({ url: "https://sub.example.test/", name: "partitioned", value: "other-partition", secure: true, sameSite: "no_restriction", partitionKey: { topLevelSite: "https://other.test", hasCrossSiteAncestor: true } });
  });
  const created = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Special" });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.message);
  expect(created.data.cookies.filter(cookie => cookie.partitionKey)).toHaveLength(2);
  expect(created.data.cookies.some(cookie => cookie.name === "")).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(await extension.extensionPage.evaluate(async ({ tabId, origin }) => {
    const raw = await chrome.tabs.sendMessage(tabId, { type: "switchaccounts:storage:v2", expectedOrigin: origin, command: "read" });
    const stored = await chrome.storage.local.get("profileRepository") as { profileRepository: { profiles: AccountProfile[] } };
    return { messageKeys: Object.keys(raw.data.localStorage), storedKeys: Object.keys(stored.profileRepository.profiles[0]!.webStorageByOrigin[origin]!.localStorage) };
  }, { tabId, origin })).toEqual({ messageKeys: ["__proto__"], storedKeys: ["__proto__"] });
  expect(Object.hasOwn(created.data.webStorageByOrigin[origin]!.localStorage, "__proto__")).toBe(true);
  if (fallback) {
    await extension.worker.evaluate(() => {
      chrome.tabs.sendMessage = (() => Promise.resolve(undefined)) as typeof chrome.tabs.sendMessage;
    });
    const fallbackCreated = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Special fallback" });
    expect(fallbackCreated.ok && Object.hasOwn(fallbackCreated.data.webStorageByOrigin[origin]!.localStorage, "__proto__")).toBe(true);
  }
  const [reset] = await Promise.all([extension.send({ type: "resetSite", tabId }), page.waitForEvent("load")]);
  expect(reset.ok).toBe(true);
  expect(await extension.extensionPage.evaluate(() => chrome.cookies.getAll({ domain: "example.test", partitionKey: {} }))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("__proto__"))).toBeNull();
  const [switched] = await Promise.all([extension.send({ type: "switchProfile", tabId, profileId: created.data.id }), page.waitForEvent("load")]);
  expect(switched.ok).toBe(true);
  const cookies = await extension.extensionPage.evaluate(() => chrome.cookies.getAll({ domain: "example.test", partitionKey: {} }));
  expect(cookies).toHaveLength(3);
  expect(cookies.filter(cookie => cookie.partitionKey).map(cookie => cookie.value).sort()).toEqual(["account-a", "other-partition"]);
  expect(await page.evaluate(() => [localStorage.getItem("__proto__"), sessionStorage.getItem("__proto__")])).toEqual(["local", "session"]);
});
}

for (const fallback of [false, true]) {
  test(`存储容量超限时返回失败并清理部分恢复内容，fallback=${fallback}`, async ({ site, extension }) => {
    const page = await extension.context.newPage();
    await page.goto(site.url("/set?account=A"));
    const tabId = await extension.tabIdFor(`example.test:${site.port}`);
    const created = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Quota" });
    if (!created.ok) throw new Error(created.error.message);
    const profile = created.data;
    profile.webStorageByOrigin[new URL(page.url()).origin]!.localStorage = { first: "partial", huge: "x".repeat(6_000_000) };
    expect(await extension.send({ type: "updateProfile", profile })).toMatchObject({ ok: true });
    if (fallback) await extension.worker.evaluate(() => {
      chrome.tabs.sendMessage = (() => Promise.reject(new Error("Receiving end does not exist"))) as typeof chrome.tabs.sendMessage;
    });
    let reloads = 0;
    page.on("load", () => { reloads++; });
    expect(await extension.send({ type: "switchProfile", tabId, profileId: profile.id })).toMatchObject({ ok: false, error: { code: "WEB_STORAGE_WRITE_FAILED" } });
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await extension.extensionPage.evaluate(() => chrome.cookies.getAll({ domain: "example.test", partitionKey: {} }))).toEqual([]);
    expect(reloads).toBe(0);
  });
}

for (const action of ["resetSite", "switchProfile"] as const) {
test(`原标签页跳转后不会清理或刷新另一个网站，操作=${action}`, async ({ site, extension }) => {
  const page = await extension.context.newPage();
  await page.goto(site.url("/set?account=A"));
  const tabId = await extension.tabIdFor(`example.test:${site.port}`);
  const profile = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Original" });
  if (!profile.ok) throw new Error(profile.error.message);
  await extension.context.route("https://unrelated.review.test/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>unrelated</body></html>" }));
  await extension.worker.evaluate(() => {
    const original = chrome.cookies.getAll.bind(chrome.cookies);
    let first = true;
    chrome.cookies.getAll = (async (details: chrome.cookies.GetAllDetails) => {
      const cookies = await original(details);
      if (first) {
        first = false;
        await new Promise<void>(resolve => { (globalThis as unknown as { releaseGate: () => void }).releaseGate = resolve; });
      }
      return cookies;
    }) as typeof chrome.cookies.getAll;
  });
  const resetting = extension.send(action === "resetSite" ? { type: action, tabId } : { type: action, tabId, profileId: profile.data.id });
  await expect.poll(() => extension.worker.evaluate(() => Boolean((globalThis as unknown as { releaseGate?: () => void }).releaseGate))).toBe(true);
  await page.goto("https://unrelated.review.test/state");
  await page.evaluate(() => { localStorage.setItem("keep", "B"); sessionStorage.setItem("keep", "B"); });
  let reloads = 0;
  page.on("load", () => { reloads++; });
  await extension.worker.evaluate(() => (globalThis as unknown as { releaseGate: () => void }).releaseGate());
  expect(await resetting).toMatchObject({ ok: false });
  expect(await page.evaluate(() => [localStorage.getItem("keep"), sessionStorage.getItem("keep")])).toEqual(["B", "B"]);
  expect(reloads).toBe(0);
  await page.goto(site.url("/state"));
  expect(await page.evaluate(() => localStorage.getItem("account"))).toBe("A");
});
}

test("管理页可连续编辑并保存 Cookie，改名重导后账号独立", async ({ site, extension }, testInfo) => {
  const page = await extension.context.newPage();
  await page.goto(site.url("/set?account=A"));
  const tabId = await extension.tabIdFor(`example.test:${site.port}`);
  const created = await extension.send<AccountProfile>({ type: "createProfile", tabId, name: "Work" });
  if (!created.ok) throw new Error(created.error.message);
  await extension.extensionPage.reload();
  const ui = extension.extensionPage;
  await ui.getByRole("tab", { name: "Cookie", exact: true }).click();
  const rowIndex = await ui.locator(".cookie-row").evaluateAll(rows => rows.findIndex(row => row.querySelector("strong")?.textContent === "domain_account"));
  const row = ui.locator(".cookie-row").nth(rowIndex);
  const name = row.getByLabel("名称", { exact: true });
  await name.press("End");
  await name.pressSequentially("_edited");
  await expect(name).toHaveValue("domain_account_edited");
  await expect(name).toBeFocused();
  await ui.screenshot({ path: testInfo.outputPath("cookie-editor.png") });
  await row.getByLabel("值", { exact: true }).fill("new-value", { timeout: 5000 });
  await ui.getByRole("button", { name: "保存 Cookie 修改" }).click();
  await expect(ui.getByRole("status")).toHaveText("修改后请保存");
  await ui.reload();
  await ui.getByRole("tab", { name: "Cookie", exact: true }).click();
  await expect(ui.locator(".cookie-row").filter({ has: ui.getByText("domain_account_edited", { exact: true }) }).getByLabel("值", { exact: true })).toHaveValue("new-value");
  expect(await extension.send({ type: "renameProfile", profileId: created.data.id, name: "Renamed" })).toMatchObject({ ok: true });
  expect(await extension.send({ type: "importProfiles", bundle: { format: "switchaccounts", schemaVersion: 2, exportedAt: new Date().toISOString(), profiles: [created.data] } })).toMatchObject({ ok: true });
  const list = await extension.send<AccountProfile[]>({ type: "listAllProfiles" });
  if (!list.ok) throw new Error(list.error.message);
  expect(new Set(list.data.map(profile => profile.id)).size).toBe(2);
  expect(await extension.send({ type: "deleteProfile", profileId: list.data.find(profile => profile.name === "Work")!.id })).toMatchObject({ ok: true });
  const remaining = await extension.send<AccountProfile[]>({ type: "listAllProfiles" });
  expect(remaining.ok && remaining.data.map(profile => profile.name)).toEqual(["Renamed"]);
});
