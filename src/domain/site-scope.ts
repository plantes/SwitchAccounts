import { getDomain } from "tldts";
import type { OperationResult, SiteScope } from "./models";
import { fail, ok } from "./models";

const CHROME_WEB_STORE_HOSTS = new Set([
  "chrome.google.com",
  "chromewebstore.google.com",
]);

export function resolveSiteScope(rawUrl: string): OperationResult<SiteScope> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return fail("UNSUPPORTED_PAGE", "当前页面 URL 无法解析。");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || CHROME_WEB_STORE_HOSTS.has(parsed.hostname)) {
    return fail("UNSUPPORTED_PAGE", "当前页面不支持账号操作。");
  }

  const hostname = parsed.hostname;
  const registrableDomain = getDomain(hostname, {
    allowPrivateDomains: true,
    extractHostname: false,
  }) ?? hostname;

  return ok({
    registrableDomain,
    currentOrigin: parsed.origin,
    hostname,
    permissionOrigins: buildPermissionOrigins(registrableDomain),
  });
}

export function buildPermissionOrigins(domain: string): string[] {
  if (domain === "localhost" || isIpAddress(domain)) {
    return [`http://${formatHost(domain)}/*`, `https://${formatHost(domain)}/*`];
  }
  return [
    `http://${domain}/*`,
    `http://*.${domain}/*`,
    `https://${domain}/*`,
    `https://*.${domain}/*`,
  ];
}

function isIpAddress(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(":");
}

function formatHost(value: string): string {
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}
