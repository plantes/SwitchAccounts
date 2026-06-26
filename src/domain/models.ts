export const SCHEMA_VERSION = 1 as const;

export interface SiteScope {
  registrableDomain: string;
  currentOrigin: string;
  hostname: string;
  permissionOrigins: string[];
}

export interface CookiePartitionKeySnapshot {
  topLevelSite?: string;
  hasCrossSiteAncestor?: boolean;
}

export interface CookieSnapshot {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: chrome.cookies.Cookie["sameSite"];
  session: boolean;
  expirationDate?: number;
  storeId: string;
  partitionKey?: CookiePartitionKeySnapshot;
}

export interface WebStorageSnapshot {
  origin: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface AccountProfile {
  id: string;
  name: string;
  normalizedName: string;
  note: string;
  registrableDomain: string;
  cookies: CookieSnapshot[];
  webStorageByOrigin: Record<string, WebStorageSnapshot>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRepository {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: AccountProfile[];
}

export interface ExportBundle {
  format: "switchaccounts";
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  profiles: AccountProfile[];
}

export type ExportScope =
  | { type: "all" }
  | { type: "site"; registrableDomain: string }
  | { type: "profile"; profileId: string };

export interface ImportPreview {
  added: number;
  overwritten: number;
  sites: string[];
  bundle: ExportBundle;
}

export interface CurrentSiteData {
  scope: SiteScope;
  authorized: boolean;
}

export type BackgroundRequest =
  | { type: "getCurrentSite"; tabId: number }
  | { type: "listProfiles"; registrableDomain: string }
  | { type: "createProfile"; tabId: number; name: string; note?: string }
  | { type: "overwriteProfile"; tabId: number; profileId: string }
  | { type: "switchProfile"; tabId: number; profileId: string }
  | { type: "deleteProfile"; profileId: string }
  | { type: "resetSite"; tabId: number }
  | { type: "updateProfile"; profile: AccountProfile }
  | { type: "importProfiles"; bundle: ExportBundle }
  | { type: "exportProfiles"; scope: ExportScope }
  | { type: "listAllProfiles" }
  | { type: "listGrantedSites" }
  | { type: "removeGrantedSite"; origins: string[] };

export interface OperationError {
  code:
    | "UNSUPPORTED_PAGE"
    | "PERMISSION_REQUIRED"
    | "PERMISSION_DENIED"
    | "EMPTY_SNAPSHOT"
    | "PROFILE_NOT_FOUND"
    | "DUPLICATE_PROFILE_NAME"
    | "SITE_MISMATCH"
    | "COOKIE_READ_FAILED"
    | "COOKIE_CLEAR_FAILED"
    | "COOKIE_WRITE_FAILED"
    | "WEB_STORAGE_READ_FAILED"
    | "WEB_STORAGE_CLEAR_FAILED"
    | "WEB_STORAGE_WRITE_FAILED"
    | "IMPORT_INVALID"
    | "STORAGE_WRITE_FAILED"
    | "OPERATION_IN_PROGRESS";
  message: string;
  details?: unknown;
}

export type OperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: OperationError };

export type WebStorageCommand =
  | { type: "readWebStorage" }
  | { type: "clearWebStorage" }
  | { type: "writeWebStorage"; snapshot: WebStorageSnapshot };

export interface ChromeAdapter {
  getTab(tabId: number): Promise<chrome.tabs.Tab>;
  containsOrigins(origins: string[]): Promise<boolean>;
  requestOrigins(origins: string[]): Promise<boolean>;
  getCookies(domain: string): Promise<chrome.cookies.Cookie[]>;
  removeCookie(details: chrome.cookies.CookieDetails): Promise<void>;
  setCookie(details: chrome.cookies.SetDetails): Promise<chrome.cookies.Cookie>;
  reloadTab(tabId: number): Promise<void>;
  sendTabMessage<T>(tabId: number, message: WebStorageCommand): Promise<T>;
  getAllOrigins(): Promise<string[]>;
  removeOrigins(origins: string[]): Promise<boolean>;
}

export function ok<T>(data: T): OperationResult<T> {
  return { ok: true, data };
}

export function fail(code: OperationError["code"], message: string, details?: unknown): OperationResult<never> {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}
