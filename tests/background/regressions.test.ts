import { expect, it } from "vitest";
import { baseProfile, secondProfile, makeEnvironment, now } from "../helpers/fixtures";
import { buildExportBundle, mergeImport, previewImport } from "../../src/domain/import-export";
import { ProfileRepositorySchema } from "../../src/domain/schemas";

it("并发写入不同账号时保留每一个成功修改", async () => {
  const env = makeEnvironment([baseProfile, secondProfile]);
  const results = await Promise.all([
    env.ops.updateProfile({ ...baseProfile, name: "Work2", normalizedName: "work2" }),
    env.ops.updateProfile({ ...secondProfile, name: "Home2", normalizedName: "home2" }),
  ]);
  expect(results.every(r => r.ok)).toBe(true);
  expect(env.state().profiles.map(p => p.name)).toEqual(["Work2", "Home2"]);
});

it("标题修改只改名称，旧版本整包更新被拒绝", async () => {
  const env = makeEnvironment();
  const edited = { ...baseProfile, cookies: [{ ...baseProfile.cookies[0]!, value: "latest" }] };
  await env.ops.updateProfile(edited);
  expect(await env.router.handle({ type: "updateProfile", profile: baseProfile })).toMatchObject({ ok: false, error: { code: "PROFILE_CONFLICT" } });
  await env.ops.renameProfile(baseProfile.id, "Renamed");
  expect(env.state().profiles[0]).toMatchObject({ name: "Renamed", cookies: [{ value: "latest" }] });
});

it("同一时刻更新也生成新版本，失败后写入队列仍可继续", async () => {
  const env = makeEnvironment([baseProfile, secondProfile]);
  const first = await env.ops.renameProfile(baseProfile.id, "Renamed");
  const second = await env.ops.renameProfile(baseProfile.id, "Again");
  expect(first.ok && second.ok && first.data.updatedAt !== second.data.updatedAt).toBe(true);
  expect(await env.router.handle({ type: "renameProfile", profileId: baseProfile.id, name: "Home" })).toMatchObject({ ok: false, error: { code: "DUPLICATE_PROFILE_NAME" } });
  expect(await env.ops.renameProfile(baseProfile.id, "Fine")).toMatchObject({ ok: true });
});

it("保存期间删除其他账号，不会在稍后的保存中复活", async () => {
  const env = makeEnvironment([baseProfile]);
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  env.chrome.getCookies.mockImplementation(async () => { started(); await gate; return []; });
  const creating = env.ops.createProfile(1, "New");
  await entered;
  await env.ops.deleteProfile(baseProfile.id);
  release();
  expect(await creating).toMatchObject({ ok: true });
  expect(env.state().profiles.map(p => p.name)).toEqual(["New"]);
});

it("改名后重导备份生成独立 ID，删除仅作用于选定账号", async () => {
  const renamed = { ...baseProfile, name: "Renamed", normalizedName: "renamed" };
  const merged = mergeImport({ schemaVersion: 2, profiles: [renamed] }, buildExportBundle([baseProfile], now));
  expect(new Set(merged.profiles.map(p => p.id)).size).toBe(2);
  const env = makeEnvironment(merged.profiles);
  await env.ops.deleteProfile(merged.profiles.find(p => p.name === "Work")!.id);
  expect(env.state().profiles.map(p => p.name)).toEqual(["Renamed"]);
});

it("导入的冲突 ID 被重新分配，按名称覆盖时保留本地 ID 并更新版本", () => {
  const merged = mergeImport({ schemaVersion: 2, profiles: [baseProfile, secondProfile] }, buildExportBundle([
    { ...baseProfile, id: secondProfile.id },
    { ...secondProfile, name: "Extra", normalizedName: "extra" },
  ], now));
  expect(new Set(merged.profiles.map(p => p.id)).size).toBe(3);
  expect(merged.profiles.find(p => p.name === "Work")?.id).toBe(baseProfile.id);
  expect(merged.profiles.find(p => p.name === "Work")?.updatedAt).not.toBe(baseProfile.updatedAt);
});

it("修复历史重复 ID 并持久化，仓库拒绝新的重复 ID", async () => {
  const env = makeEnvironment([baseProfile, { ...secondProfile, id: baseProfile.id }]);
  const first = await env.repository.load();
  const second = await env.repository.load();
  expect(new Set(first.profiles.map(p => p.id)).size).toBe(2);
  expect(second).toEqual(first);
  expect(env.state()).toEqual(first);
  expect(ProfileRepositorySchema.safeParse({ schemaVersion: 2, profiles: [baseProfile, baseProfile] }).success).toBe(false);
});

it("合法无名 Cookie 可以完整保存", async () => {
  const env = makeEnvironment([]);
  env.chrome.getCookies.mockResolvedValue([{ ...baseProfile.cookies[0]!, name: "" } as chrome.cookies.Cookie]);
  expect(await env.ops.createProfile(1, "New")).toMatchObject({ ok: true, data: { cookies: [{ name: "" }] } });
});

it("脚本返回空回执时切换失败、二次清理且不刷新", async () => {
  const env = makeEnvironment();
  env.chrome.sendTabMessage.mockRejectedValue(new Error("no receiver"));
  env.chrome.executeWebStorageCommand.mockImplementation(async (_target, message) => message.command === "write" ? null : { ok: true, data: true });
  expect(await env.ops.switchProfile(1, baseProfile.id)).toMatchObject({ ok: false, error: { code: "WEB_STORAGE_WRITE_FAILED" } });
  expect(env.chrome.reloadTab).not.toHaveBeenCalled();
  expect(env.chrome.executeWebStorageCommand.mock.calls.filter(([, message]) => message.command === "clear")).toHaveLength(2);
});

it("页面清理失败时所有后续调用仍绑定原 documentId", async () => {
  const env = makeEnvironment();
  env.chrome.sendTabMessage.mockRejectedValue(new Error("document unloaded"));
  env.chrome.executeWebStorageCommand.mockRejectedValue(new Error("No document with id"));
  expect(await env.ops.switchProfile(1, baseProfile.id)).toMatchObject({ ok: false });
  expect(env.chrome.setCookie).not.toHaveBeenCalled();
  expect(env.chrome.reloadTab).not.toHaveBeenCalled();
  expect(env.chrome.executeWebStorageCommand.mock.calls.every(([target]) => target.documentId === "original-document")).toBe(true);
});

it("存储写入异常向界面返回结构化错误", async () => {
  const env = makeEnvironment();
  env.storage.set.mockRejectedValue(new Error("quota"));
  expect(await env.router.handle({ type: "renameProfile", profileId: baseProfile.id, name: "New" })).toMatchObject({ ok: false, error: { code: "STORAGE_WRITE_FAILED" } });
  expect(env.state().profiles[0]!.name).toBe("Work");
});

for (const action of ["resetSite", "switchProfile"] as const) {
  it(`读取 Cookie 期间同站跳转后停止清理，操作=${action}`, async () => {
    const env = makeEnvironment();
    env.chrome.getCookies.mockImplementation(async () => {
      env.chrome.getDocumentTarget.mockResolvedValue({ ...env.target, documentId: "new-document" });
      return structuredClone(baseProfile.cookies) as chrome.cookies.Cookie[];
    });
    const result = action === "resetSite"
      ? await env.ops.resetSite(1)
      : await env.ops.switchProfile(1, baseProfile.id);
    expect(result).toMatchObject({ ok: false, error: { code: "SITE_CHANGED" } });
    expect(env.chrome.removeCookie).not.toHaveBeenCalled();
    expect(env.chrome.setCookie).not.toHaveBeenCalled();
    expect(env.chrome.reloadTab).not.toHaveBeenCalled();
  });
}

it("恢复 Cookie 期间同站跳转后不继续写入，也不清理新页面 Cookie", async () => {
  const profile = { ...baseProfile, cookies: [baseProfile.cookies[0]!, { ...baseProfile.cookies[0]!, name: "second" }] };
  const env = makeEnvironment([profile]);
  env.chrome.setCookie.mockImplementation(async () => {
    env.chrome.getDocumentTarget.mockResolvedValue({ ...env.target, documentId: "new-document" });
    return baseProfile.cookies[0]! as chrome.cookies.Cookie;
  });
  expect(await env.ops.switchProfile(1, profile.id)).toMatchObject({ ok: false, error: { code: "SITE_CHANGED" } });
  expect(env.chrome.setCookie).toHaveBeenCalledTimes(1);
  expect(env.chrome.removeCookie).toHaveBeenCalledTimes(1);
  expect(env.chrome.reloadTab).not.toHaveBeenCalled();
});

it("导入在写入队列内校验预览版本，拒绝覆盖排在前面的修改", async () => {
  const env = makeEnvironment();
  const bundle = buildExportBundle([baseProfile], now);
  const preview = previewImport(env.state(), bundle);
  const update = env.ops.updateProfile({ ...baseProfile, cookies: [{ ...baseProfile.cookies[0]!, value: "latest" }] });
  const importing = env.router.handle({ type: "importProfiles", bundle, expectedProfiles: preview.expectedProfiles });
  expect(await update).toMatchObject({ ok: true });
  expect(await importing).toMatchObject({ ok: false, error: { code: "PROFILE_CONFLICT" } });
  expect(env.state().profiles[0]!.cookies[0]!.value).toBe("latest");
});

it("导入原本新增的账号已有同名记录时，旧预览不能覆盖新记录", async () => {
  const env = makeEnvironment([]);
  const bundle = buildExportBundle([baseProfile], now);
  const preview = previewImport(env.state(), bundle);
  await env.ops.createProfile(1, "Work");
  const state = env.state();
  expect(await env.router.handle({ type: "importProfiles", bundle, expectedProfiles: preview.expectedProfiles }))
    .toMatchObject({ ok: false, error: { code: "PROFILE_CONFLICT" } });
  expect(env.state()).toEqual(state);
});

it("同名账号被删除重建后，版本时间相同也不能使用旧导入预览", async () => {
  const env = makeEnvironment();
  const bundle = buildExportBundle([baseProfile], now);
  const preview = previewImport(env.state(), bundle);
  await env.ops.deleteProfile(baseProfile.id);
  await env.ops.createProfile(1, "Work");
  expect(env.state().profiles[0]!.updatedAt).toBe(baseProfile.updatedAt);
  expect(await env.router.handle({ type: "importProfiles", bundle, expectedProfiles: preview.expectedProfiles }))
    .toMatchObject({ ok: false, error: { code: "PROFILE_CONFLICT" } });
});

it("导入不受无关账号修改影响，最新预览可以正常写入", async () => {
  const env = makeEnvironment([baseProfile, secondProfile]);
  const bundle = buildExportBundle([baseProfile], now);
  const preview = previewImport(env.state(), bundle);
  await env.ops.renameProfile(secondProfile.id, "Home updated");
  expect(await env.router.handle({ type: "importProfiles", bundle, expectedProfiles: preview.expectedProfiles })).toMatchObject({ ok: true });
  expect(env.state().profiles.find(p => p.id === secondProfile.id)!.name).toBe("Home updated");
});
