import { cookieRemovalDetails, fromChromeCookie, toSetDetails } from "../domain/cookies";
import { buildExportBundle, mergeImport, selectProfiles } from "../domain/import-export";
import type {
  AccountProfile,
  ChromeAdapter,
  CurrentSiteData,
  DocumentTarget,
  ExportBundle,
  ExportScope,
  OperationError,
  OperationResult,
  ProfileRepository,
  SiteScope,
  WebStorageSnapshot,
} from "../domain/models";
import { fail, ok, SCHEMA_VERSION } from "../domain/models";
import { hasDuplicateName, isEmptySnapshot, nextUpdatedAt, normalizeProfileName } from "../domain/profiles";
import { resolveSiteScope } from "../domain/site-scope";
import { AccountProfileSchema, WebStorageSnapshotSchema } from "../domain/schemas";
import { unwrapWebStorageResponse } from "../domain/web-storage";
import type { ProfileRepositoryStore } from "../infrastructure/profile-repository";
import type { SiteOperationLock } from "../infrastructure/site-lock";

export class BackgroundOperations {
  constructor(private readonly deps: {
    chrome: ChromeAdapter;
    repository: ProfileRepositoryStore;
    lock: SiteOperationLock;
    now: () => string;
    uuid: () => string;
  }) {}

  async getCurrentSite(tabId: number): Promise<OperationResult<CurrentSiteData>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    return ok({
      scope: scopeResult.data,
      authorized: await this.deps.chrome.containsOrigins(scopeResult.data.permissionOrigins),
    });
  }

  async listProfiles(registrableDomain: string): Promise<OperationResult<AccountProfile[]>> {
    return ok(await this.deps.repository.listBySite(registrableDomain));
  }

  async listAllProfiles(): Promise<OperationResult<AccountProfile[]>> {
    return ok((await this.deps.repository.load()).profiles);
  }

  async createProfile(tabId: number, rawName: string): Promise<OperationResult<AccountProfile>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;

      const target = await this.deps.chrome.getDocumentTarget(tabId, scope.currentOrigin);
      const snapshot = await this.captureSnapshot(target, scope);
      if (!snapshot.ok) return snapshot;
      if (isEmptySnapshot(snapshot.data.cookies, snapshot.data.webStorage)) {
        return fail("EMPTY_SNAPSHOT", "当前站点没有可保存的登录状态。");
      }

      const now = this.deps.now();
      const name = rawName.trim();
      const profile: AccountProfile = {
        id: this.deps.uuid(),
        name,
        normalizedName: normalizeProfileName(name),
        registrableDomain: scope.registrableDomain,
        cookies: snapshot.data.cookies,
        webStorageByOrigin: { [scope.currentOrigin]: snapshot.data.webStorage },
        createdAt: now,
        updatedAt: now,
      };
      return this.deps.repository.mutate((repository) => {
        this.assertUniqueName(repository, profile);
        return { repository: { schemaVersion: SCHEMA_VERSION, profiles: repository.profiles.concat(profile) }, result: ok(profile) };
      });
    });
  }

  async overwriteProfile(tabId: number, profileId: string): Promise<OperationResult<AccountProfile>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;
      const existing = await this.deps.repository.findById(profileId);
      if (!existing) return fail("PROFILE_NOT_FOUND", "账号配置不存在。");
      if (existing.registrableDomain !== scope.registrableDomain) return fail("SITE_MISMATCH", "账号配置不属于当前网站。");

      const target = await this.deps.chrome.getDocumentTarget(tabId, scope.currentOrigin);
      const snapshot = await this.captureSnapshot(target, scope);
      if (!snapshot.ok) return snapshot;
      if (isEmptySnapshot(snapshot.data.cookies, snapshot.data.webStorage)) {
        return fail("EMPTY_SNAPSHOT", "当前站点没有可覆盖保存的登录状态。");
      }

      return this.changeProfile(profileId, (latest) => ({
        ...latest,
        cookies: snapshot.data.cookies,
        webStorageByOrigin: { ...latest.webStorageByOrigin, [scope.currentOrigin]: snapshot.data.webStorage },
      }));
    });
  }

  async deleteProfile(profileId: string): Promise<OperationResult<{ profileId: string }>> {
    return this.deps.repository.mutate((repository) => {
      const nextProfiles = repository.profiles.filter((profile) => profile.id !== profileId);
      if (nextProfiles.length === repository.profiles.length) throw operationFailure("PROFILE_NOT_FOUND", "账号配置不存在。");
      return { repository: { schemaVersion: SCHEMA_VERSION, profiles: nextProfiles }, result: ok({ profileId }) };
    });
  }

  async switchProfile(tabId: number, profileId: string): Promise<OperationResult<{ profileId: string }>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;
      const profile = await this.deps.repository.findById(profileId);
      if (!profile) return fail("PROFILE_NOT_FOUND", "账号配置不存在。");
      if (profile.registrableDomain !== scope.registrableDomain) return fail("SITE_MISMATCH", "账号配置不属于当前网站。");

      const target = await this.deps.chrome.getDocumentTarget(tabId, scope.currentOrigin);
      try {
        await this.clearSiteState(target, scope);
        await this.restoreProfile(target, scope, profile);
        await this.deps.chrome.reloadTab(target);
        return ok({ profileId });
      } catch (error) {
        await this.cleanupAfterFailure(target, scope);
        const mapped = mapOperationFailure(error);
        return fail(mapped.code, mapped.message, mapped.details);
      }
    });
  }

  async resetSite(tabId: number): Promise<OperationResult<{ tabId: number }>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;
      const target = await this.deps.chrome.getDocumentTarget(tabId, scope.currentOrigin);
      try {
        await this.clearSiteState(target, scope);
        await this.deps.chrome.reloadTab(target);
        return ok({ tabId });
      } catch (error) {
        const mapped = mapOperationFailure(error);
        return fail(mapped.code, mapped.message, mapped.details);
      }
    });
  }

  async updateProfile(profile: AccountProfile): Promise<OperationResult<AccountProfile>> {
    const parsed = AccountProfileSchema.safeParse(profile);
    if (!parsed.success) return fail("IMPORT_INVALID", "账号配置字段非法。");
    return this.changeProfile(profile.id, (latest) => {
      if (latest.updatedAt !== profile.updatedAt) throw operationFailure("PROFILE_CONFLICT", "此账号已在其他位置修改，请重新载入后再编辑；当前草稿尚未保存。");
      if (latest.registrableDomain !== profile.registrableDomain) throw operationFailure("SITE_MISMATCH", "不能修改账号所属网站。");
      return { ...parsed.data, createdAt: latest.createdAt } as AccountProfile;
    });
  }

  async renameProfile(profileId: string, name: string): Promise<OperationResult<AccountProfile>> {
    if (!name.trim()) return fail("IMPORT_INVALID", "账号名称不能为空。");
    return this.changeProfile(profileId, (latest) => ({ ...latest, name: name.trim(), normalizedName: normalizeProfileName(name) }));
  }

  async exportProfiles(scope: ExportScope): Promise<OperationResult<ExportBundle>> {
    const repository = await this.deps.repository.load();
    return ok(buildExportBundle(selectProfiles(repository, scope), this.deps.now()));
  }

  async importProfiles(bundle: ExportBundle): Promise<OperationResult<ProfileRepository>> {
    try {
      return await this.deps.repository.mutate((repository) => {
        const next = mergeImport(repository, bundle, this.deps.uuid, this.deps.now());
        return { repository: next, result: ok(next) };
      });
    } catch (error) {
      if (isOperationError(error)) return { ok: false, error };
      return fail("IMPORT_INVALID", "导入文件格式或内容非法。", error instanceof Error ? error.message : String(error));
    }
  }

  async listGrantedSites(): Promise<OperationResult<string[]>> {
    return ok(await this.deps.chrome.getAllOrigins());
  }

  async removeGrantedSite(origins: string[]): Promise<OperationResult<{ removed: boolean }>> {
    return ok({ removed: await this.deps.chrome.removeOrigins(origins) });
  }

  private async resolveScopeFromTab(tabId: number): Promise<OperationResult<SiteScope>> {
    const tab = await this.deps.chrome.getTab(tabId);
    if (!tab.url) return fail("UNSUPPORTED_PAGE", "当前标签页没有可用 URL。");
    return resolveSiteScope(tab.url);
  }

  private async ensurePermission(scope: SiteScope): Promise<OperationResult<true>> {
    if (await this.deps.chrome.containsOrigins(scope.permissionOrigins)) return ok(true);
    if (await this.deps.chrome.requestOrigins(scope.permissionOrigins)) return ok(true);
    return fail("PERMISSION_DENIED", "用户拒绝授权当前网站。");
  }

  private async captureSnapshot(target: DocumentTarget, scope: SiteScope): Promise<OperationResult<{
    cookies: AccountProfile["cookies"];
    webStorage: WebStorageSnapshot;
  }>> {
    try {
      const cookies = (await this.deps.chrome.getCookies(scope.registrableDomain)).map(fromChromeCookie);
      const webStorage = await this.runWebStorageCommand(target, { command: "read" });
      const parsed = WebStorageSnapshotSchema.safeParse(webStorage);
      if (!parsed.success) {
        return fail("WEB_STORAGE_READ_FAILED", "读取 Web Storage 失败。", parsed.error.issues.map((issue) => issue.message));
      }
      return ok({ cookies, webStorage: parsed.data as WebStorageSnapshot });
    } catch (error) {
      if (isOperationError(error)) return { ok: false, error };
      return fail("COOKIE_READ_FAILED", "读取当前网站状态失败。", error instanceof Error ? error.message : String(error));
    }
  }

  private async clearSiteState(target: DocumentTarget, scope: SiteScope): Promise<void> {
    try {
      const cookies = await this.deps.chrome.getCookies(scope.registrableDomain);
      for (const cookie of cookies.map(fromChromeCookie)) {
        await this.deps.chrome.removeCookie(cookieRemovalDetails(cookie));
      }
    } catch (cause) {
      throw operationFailure("COOKIE_CLEAR_FAILED", "清理 Cookie 失败。", cause);
    }

    try {
      await this.runWebStorageCommand(target, { command: "clear" });
    } catch (cause) {
      throw operationFailure("WEB_STORAGE_CLEAR_FAILED", "清理 Web Storage 失败。", cause);
    }
  }

  private async restoreProfile(target: DocumentTarget, scope: SiteScope, profile: AccountProfile): Promise<void> {
    const nowSeconds = Date.parse(this.deps.now()) / 1000;
    for (const cookie of profile.cookies) {
      if (isExpiredPersistentCookie(cookie, nowSeconds)) continue;
      try {
        await this.deps.chrome.setCookie(toSetDetails(cookie));
      } catch (cause) {
        throw operationFailure("COOKIE_WRITE_FAILED", "恢复 Cookie 失败。", {
          name: cookie.name,
          domain: cookie.domain,
          cause: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    const snapshot = profile.webStorageByOrigin[scope.currentOrigin] ?? {
      origin: scope.currentOrigin,
      localStorage: {},
      sessionStorage: {},
    };
    try {
      await this.runWebStorageCommand(target, { command: "write", snapshot });
    } catch (cause) {
      throw operationFailure("WEB_STORAGE_WRITE_FAILED", "恢复 Web Storage 失败。", cause);
    }
  }

  private async cleanupAfterFailure(target: DocumentTarget, scope: SiteScope): Promise<void> {
    try {
      await this.clearSiteState(target, scope);
    } catch {
      // 切换失败时不刷新；保留原始失败给用户重试。
    }
  }

  private async runWebStorageCommand(target: DocumentTarget, command: { command: "read" | "clear" } | { command: "write"; snapshot: WebStorageSnapshot }): Promise<WebStorageSnapshot | true> {
    const message = { type: "switchaccounts:storage:v2" as const, expectedOrigin: target.origin, ...command };
    let response: unknown;
    try {
      response = await this.deps.chrome.sendTabMessage(target, message);
    } catch {
      response = undefined;
    }
    // Old content scripts can ignore the versioned message without rejecting the transport.
    if (response === undefined) response = await this.deps.chrome.executeWebStorageCommand(target, message);
    return unwrapWebStorageResponse(response, message);
  }

  private async changeProfile(profileId: string, change: (profile: AccountProfile) => AccountProfile): Promise<OperationResult<AccountProfile>> {
    return this.deps.repository.mutate((repository) => {
      const index = repository.profiles.findIndex((profile) => profile.id === profileId);
      const existing = repository.profiles[index];
      if (!existing) throw operationFailure("PROFILE_NOT_FOUND", "账号配置不存在。");
      const updated = { ...change(existing), updatedAt: nextUpdatedAt(existing.updatedAt, this.deps.now()) };
      this.assertUniqueName(repository, updated);
      const profiles = repository.profiles.slice();
      profiles[index] = updated;
      return { repository: { schemaVersion: SCHEMA_VERSION, profiles }, result: ok(updated) };
    });
  }

  private assertUniqueName(repository: ProfileRepository, profile: AccountProfile): void {
    if (hasDuplicateName(repository.profiles, profile.registrableDomain, profile.name, profile.id)) {
      throw operationFailure("DUPLICATE_PROFILE_NAME", "同一网站下账号名称不能重复。");
    }
  }

  private async withSiteLock<T>(
    registrableDomain: string,
    operation: () => Promise<OperationResult<T>>,
  ): Promise<OperationResult<T>> {
    try {
      return await this.deps.lock.run(registrableDomain, operation);
    } catch (error) {
      if (isOperationError(error)) return { ok: false, error };
      throw error;
    }
  }
}

function operationFailure(code: OperationError["code"], message: string, details?: unknown): OperationError {
  return details === undefined ? { code, message } : { code, message, details };
}

function mapOperationFailure(error: unknown): OperationError {
  if (isOperationError(error)) return error;
  return operationFailure("STORAGE_WRITE_FAILED", "操作失败。", error instanceof Error ? error.message : String(error));
}

function isOperationError(error: unknown): error is OperationError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function isExpiredPersistentCookie(cookie: AccountProfile["cookies"][number], nowSeconds: number): boolean {
  return !cookie.session && cookie.expirationDate !== undefined && cookie.expirationDate <= nowSeconds;
}
