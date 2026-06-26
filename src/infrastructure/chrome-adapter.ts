import type { ChromeAdapter, WebStorageCommand } from "../domain/models";

export class BrowserChromeAdapter implements ChromeAdapter {
  async getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return chrome.tabs.get(tabId);
  }

  async containsOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.contains({ origins });
  }

  async requestOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.request({ origins });
  }

  async getCookies(domain: string): Promise<chrome.cookies.Cookie[]> {
    return chrome.cookies.getAll({ domain });
  }

  async removeCookie(details: chrome.cookies.CookieDetails): Promise<void> {
    await chrome.cookies.remove(details);
  }

  async setCookie(details: chrome.cookies.SetDetails): Promise<chrome.cookies.Cookie> {
    const cookie = await chrome.cookies.set(details);
    if (!cookie) throw new Error(`Cookie not set: ${details.name ?? ""}`);
    return cookie;
  }

  async reloadTab(tabId: number): Promise<void> {
    await chrome.tabs.reload(tabId);
  }

  async sendTabMessage<T>(tabId: number, message: WebStorageCommand): Promise<T> {
    return chrome.tabs.sendMessage(tabId, message);
  }

  async getAllOrigins(): Promise<string[]> {
    const permissions = await chrome.permissions.getAll();
    return permissions.origins ?? [];
  }

  async removeOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.remove({ origins });
  }
}
