import type { CookiePartitionKeySnapshot, CookieSnapshot } from "./models";

type SetDetailsWithPartition = chrome.cookies.SetDetails & {
  partitionKey?: CookiePartitionKeySnapshot;
};

type RemoveDetailsWithPartition = chrome.cookies.CookieDetails & {
  partitionKey?: CookiePartitionKeySnapshot;
};

export function fromChromeCookie(cookie: chrome.cookies.Cookie): CookieSnapshot {
  const snapshot: CookieSnapshot = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    hostOnly: cookie.hostOnly,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    storeId: cookie.storeId,
  };
  if (cookie.expirationDate !== undefined) snapshot.expirationDate = cookie.expirationDate;
  if (cookie.partitionKey !== undefined) snapshot.partitionKey = normalizePartitionKey(cookie.partitionKey);
  return snapshot;
}

export function toSetDetails(cookie: CookieSnapshot): SetDetailsWithPartition {
  const details: SetDetailsWithPartition = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
  };
  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (!cookie.session && cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  if (cookie.partitionKey !== undefined) details.partitionKey = { ...cookie.partitionKey };
  return details;
}

export function cookieRemovalDetails(cookie: CookieSnapshot): RemoveDetailsWithPartition {
  const details: RemoveDetailsWithPartition = {
    url: cookieUrl(cookie),
    name: cookie.name,
    storeId: cookie.storeId,
  };
  if (cookie.partitionKey !== undefined) details.partitionKey = { ...cookie.partitionKey };
  return details;
}

export function cookieUrl(cookie: Pick<CookieSnapshot, "secure" | "domain" | "path">): string {
  const protocol = cookie.secure ? "https:" : "http:";
  const domain = cookie.domain.replace(/^\./, "");
  return `${protocol}//${domain}${cookie.path.startsWith("/") ? cookie.path : `/${cookie.path}`}`;
}

export function validateCookieDomain(cookieDomain: string, registrableDomain: string): boolean {
  const normalized = cookieDomain.replace(/^\./, "").toLowerCase();
  const root = registrableDomain.toLowerCase();
  return normalized === root || normalized.endsWith(`.${root}`);
}

function normalizePartitionKey(key: chrome.cookies.CookiePartitionKey): CookiePartitionKeySnapshot {
  const snapshot: CookiePartitionKeySnapshot = {};
  if (key.topLevelSite !== undefined) snapshot.topLevelSite = key.topLevelSite;
  if (key.hasCrossSiteAncestor !== undefined) snapshot.hasCrossSiteAncestor = key.hasCrossSiteAncestor;
  return snapshot;
}
