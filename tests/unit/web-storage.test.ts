import { afterEach, expect, it, vi } from "vitest";
import { runWebStorageCommandInTab } from "../../src/infrastructure/web-storage-script";
import { unwrapWebStorageResponse } from "../../src/domain/web-storage";
import { AccountProfileSchema } from "../../src/domain/schemas";
import { baseProfile, makeEnvironment } from "../helpers/fixtures";
import { buildExportBundle, mergeImport } from "../../src/domain/import-export";
import { BrowserChromeAdapter } from "../../src/infrastructure/chrome-adapter";

const origin = location.origin;
const message = { type: "switchaccounts:storage:v2" as const, expectedOrigin: origin };
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

it("两个 Storage 的特殊键经过捕获、校验、存储和导入导出往返不丢失", async () => {
  localStorage.setItem("__proto__", "local-value");
  sessionStorage.setItem("__proto__", "session-value");
  const read = runWebStorageCommandInTab({ ...message, command: "read" });
  if (!read.ok || read.data === true) throw new Error("snapshot missing");
  expect(Object.hasOwn(read.data.localStorage, "__proto__")).toBe(true);
  const profile = { ...baseProfile, webStorageByOrigin: { [origin]: read.data } };
  expect(AccountProfileSchema.parse(profile).webStorageByOrigin[origin]!.localStorage.__proto__).toBe("local-value");
  const env = makeEnvironment([profile]);
  const stored = await env.repository.load();
  const bundle = JSON.parse(JSON.stringify(buildExportBundle(stored.profiles, baseProfile.updatedAt)));
  const imported = mergeImport({ schemaVersion: 2, profiles: [] }, bundle);
  const snapshot = imported.profiles[0]!.webStorageByOrigin[origin]!;
  localStorage.clear(); sessionStorage.clear();
  expect(runWebStorageCommandInTab({ ...message, command: "write", snapshot })).toEqual({ ok: true, data: true });
  expect(localStorage.getItem("__proto__")).toBe("local-value");
  expect(sessionStorage.getItem("__proto__")).toBe("session-value");
});

it("不匹配的 origin 不能读取、清除或恢复页面数据", () => {
  localStorage.setItem("keep", "untouched");
  for (const command of ["read", "clear", "check", "reload"] as const) {
    expect(runWebStorageCommandInTab({ ...message, command, expectedOrigin: "https://wrong.test" })).toMatchObject({ ok: false, error: { code: "SITE_CHANGED" } });
  }
  expect(runWebStorageCommandInTab({ ...message, command: "write", snapshot: { origin: "https://wrong.test", localStorage: {}, sessionStorage: {} } })).toMatchObject({ ok: false });
  expect(localStorage.getItem("keep")).toBe("untouched");
});

it("脚本捕获容量异常并拒绝空的成功回执", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  const write = { ...message, command: "write" as const, snapshot: { origin, localStorage: { key: "value" }, sessionStorage: {} } };
  const response = runWebStorageCommandInTab(write);
  expect(response).toMatchObject({ ok: false, error: { code: "WEB_STORAGE_WRITE_FAILED" } });
  expect(() => unwrapWebStorageResponse(response, write)).toThrow();
  for (const invalid of [null, undefined, {}, { ok: true }, { ok: true, data: null }]) {
    expect(() => unwrapWebStorageResponse(invalid, write)).toThrow();
  }
});

it("浏览器适配器读取全部分区并将消息和脚本限定到原文档", async () => {
  const getAll = vi.fn(async () => []);
  const sendMessage = vi.fn(async () => ({ ok: true, data: true }));
  const executeScript = vi.fn(async () => [{ documentId: "doc-a", result: origin }]);
  vi.stubGlobal("chrome", { cookies: { getAll }, tabs: { sendMessage }, scripting: { executeScript } });
  const adapter = new BrowserChromeAdapter();
  await adapter.getCookies("example.com");
  expect(getAll).toHaveBeenCalledWith({ domain: "example.com", partitionKey: {} });
  const target = await adapter.getDocumentTarget(1, origin);
  const command = { ...message, command: "clear" as const };
  await adapter.sendTabMessage(target, command);
  expect(sendMessage).toHaveBeenCalledWith(1, command, { documentId: "doc-a" });
  await adapter.executeWebStorageCommand(target, command);
  expect(executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ target: { tabId: 1, documentIds: ["doc-a"] } }));
  expect(executeScript).toHaveBeenLastCalledWith(expect.objectContaining({ args: [JSON.stringify(command)] }));
});
