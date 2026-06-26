import { cookieRemovalDetails, fromChromeCookie, toSetDetails } from "../domain/cookies";
import { buildExportBundle, mergeImport, selectProfiles } from "../domain/import-export";
import type {
  AccountProfile,
  ChromeAdapter,
  CurrentSiteData,
  ExportBundle,
  ExportScope,
  OperationError,
  OperationResult,
  ProfileRepository,
  SiteScope,
  WebStorageSnapshot,
} from "../domain/models";
import { fail, ok, SCHEMA_VERSION } from "../domain/models";
import { hasDuplicateName, isEmptySnapshot, normalizeProfileName } from "../domain/profiles";
import { resolveSiteScope } from "../domain/site-scope";
import { AccountProfileSchema, WebStorageSnapshotSchema } from "../domain/schemas";
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

  async createProfile(tabId: number, rawName: string, note = ""): Promise<OperationResult<AccountProfile>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;

      const repository = await this.deps.repository.load();
      if (hasDuplicateName(repository.profiles, scope.registrableDomain, rawName)) {
        return fail("DUPLICATE_PROFILE_NAME", "同一网站下账号名称不能重复。");
      }

      const snapshot = await this.captureSnapshot(tabId, scope);
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
        note,
        registrableDomain: scope.registrableDomain,
        cookies: snapshot.data.cookies,
        webStorageByOrigin: { [scope.currentOrigin]: snapshot.data.webStorage },
        createdAt: now,
        updatedAt: now,
      };
      await this.deps.repository.save({ schemaVersion: SCHEMA_VERSION, profiles: repository.profiles.concat(profile) });
      return ok(profile);
    });
  }

  async overwriteProfile(tabId: number, profileId: string): Promise<OperationResult<AccountProfile>> {
    const scopeResult = await this.resolveScopeFromTab(tabId);
    if (!scopeResult.ok) return scopeResult;
    const scope = scopeResult.data;

    return this.withSiteLock(scope.registrableDomain, async () => {
      const permission = await this.ensurePermission(scope);
      if (!permission.ok) return permission;
      const repository = await this.deps.repository.load();
      const existing = repository.profiles.find((profile) => profile.id === profileId);
      if (!existing) return fail("PROFILE_NOT_FOUND", "账号配置不存在。");
      if (existing.registrableDomain !== scope.registrableDomain) return fail("SITE_MISMATCH", "账号配置不属于当前网站。");

      const snapshot = await this.captureSnapshot(tabId, scope);
      if (!snapshot.ok) return snapshot;
      if (isEmptySnapshot(snapshot.data.cookies, snapshot.data.webStorage)) {
        return fail("EMPTY_SNAPSHOT", "当前站点没有可覆盖保存的登录状态。");
      }

      const updated: AccountProfile = {
        ...existing,
        cookies: snapshot.data.cookies,
        webStorageByOrigin: { ...existing.webStorageByOrigin, [scope.currentOrigin]: snapshot.data.webStorage },
        updatedAt: this.deps.now(),
      };
      await this.replaceProfile(repository, updated);
      return ok(updated);
    });
  }

  async deleteProfile(profileId: string): Promise<OperationResult<{ profileId: string }>> {
    const repository = await this.deps.repository.load();
    const nextProfiles = repository.profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === repository.profiles.length) return fail("PROFILE_NOT_FOUND", "账号配置不存在。");
    await this.deps.repository.save({ schemaVersion: SCHEMA_VERSION, profiles: nextProfiles });
    return ok({ profileId });
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

      try {
        await this.clearSiteState(tabId, scope);
        await this.restoreProfile(tabId, scope, profile);
        await this.deps.chrome.reloadTab(tabId);
        return ok({ profileId });
      } catch (error) {
        await this.cleanupAfterFailure(tabId, scope);
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
      try {
        await this.clearSiteState(tabId, scope);
        await this.deps.chrome.reloadTab(tabId);
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
    const repository = await this.deps.repository.load();
    if (hasDuplicateName(repository.profiles, parsed.data.registrableDomain, parsed.data.name, parsed.data.id)) {
      return fail("DUPLICATE_PROFILE_NAME", "同一网站下账号名称不能重复。");
    }
    const validatedProfile = parsed.data as AccountProfile;
    await this.replaceProfile(repository, validatedProfile);
    return ok(validatedProfile);
  }

  async exportProfiles(scope: ExportScope): Promise<OperationResult<ExportBundle>> {
    const repository = await this.deps.repository.load();
    return ok(buildExportBundle(selectProfiles(repository, scope), this.deps.now()));
  }

  async importProfiles(bundle: ExportBundle): Promise<OperationResult<ProfileRepository>> {
    const repository = await this.deps.repository.load();
    try {
      const next = mergeImport(repository, bundle);
      await this.deps.repository.save(next);
      return ok(next);
    } catch (error) {
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

  private async captureSnapshot(tabId: number, scope: SiteScope): Promise<OperationResult<{
    cookies: AccountProfile["cookies"];
    webStorage: WebStorageSnapshot;
  }>> {
    try {
      const cookies = (await this.deps.chrome.getCookies(scope.registrableDomain)).map(fromChromeCookie);
      const webStorage = await this.deps.chrome.sendTabMessage<unknown>(tabId, { type: "readWebStorage" });
      const parsed = WebStorageSnapshotSchema.safeParse(webStorage);
      if (!parsed.success) {
        return fail("WEB_STORAGE_READ_FAILED", "读取 Web Storage 失败。", parsed.error.issues.map((issue) => issue.message));
      }
      return ok({ cookies, webStorage: parsed.data as WebStorageSnapshot });
    } catch (error) {
      return fail("COOKIE_READ_FAILED", "读取当前网站状态失败。", error instanceof Error ? error.message : String(error));
    }
  }

  private async clearSiteState(tabId: number, scope: SiteScope): Promise<void> {
    try {
      const cookies = await this.deps.chrome.getCookies(scope.registrableDomain);
      for (const cookie of cookies.map(fromChromeCookie)) {
        await this.deps.chrome.removeCookie(cookieRemovalDetails(cookie));
      }
    } catch (cause) {
      throw operationFailure("COOKIE_CLEAR_FAILED", "清理 Cookie 失败。", cause);
    }

    try {
      await this.deps.chrome.sendTabMessage(tabId, { type: "clearWebStorage" });
    } catch (cause) {
      throw operationFailure("WEB_STORAGE_CLEAR_FAILED", "清理 Web Storage 失败。", cause);
    }
  }

  private async restoreProfile(tabId: number, scope: SiteScope, profile: AccountProfile): Promise<void> {
    for (const cookie of profile.cookies) {
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
      await this.deps.chrome.sendTabMessage(tabId, { type: "writeWebStorage", snapshot });
    } catch (cause) {
      throw operationFailure("WEB_STORAGE_WRITE_FAILED", "恢复 Web Storage 失败。", cause);
    }
  }

  private async cleanupAfterFailure(tabId: number, scope: SiteScope): Promise<void> {
    try {
      await this.clearSiteState(tabId, scope);
    } catch {
      // 切换失败时不刷新；保留原始失败给用户重试。
    }
  }

  private async replaceProfile(repository: ProfileRepository, profile: AccountProfile): Promise<void> {
    const index = repository.profiles.findIndex((item) => item.id === profile.id);
    if (index < 0) throw operationFailure("PROFILE_NOT_FOUND", "账号配置不存在。");
    const nextProfiles = repository.profiles.slice();
    nextProfiles[index] = profile;
    await this.deps.repository.save({ schemaVersion: SCHEMA_VERSION, profiles: nextProfiles });
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
