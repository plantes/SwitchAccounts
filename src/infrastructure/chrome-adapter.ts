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

  async executeWebStorageCommand<T>(tabId: number, message: WebStorageCommand): Promise<T> {
    const [result] = await chrome.scripting.executeScript<[WebStorageCommand], unknown>({
      target: { tabId },
      injectImmediately: true,
      func: runWebStorageCommandInTab,
      args: [message],
    });
    if (!result) throw new Error("Web Storage script did not return a result");
    return result.result as T;
  }

  async getAllOrigins(): Promise<string[]> {
    const permissions = await chrome.permissions.getAll();
    return permissions.origins ?? [];
  }

  async removeOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.remove({ origins });
  }
}

function runWebStorageCommandInTab(message: WebStorageCommand): unknown {
  function dumpStorage(storage: Storage): Record<string, string> {
    const data: Record<string, string> = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) data[key] = storage.getItem(key) ?? "";
    }
    return data;
  }

  if (message.type === "readWebStorage") {
    return {
      origin: location.origin,
      localStorage: dumpStorage(localStorage),
      sessionStorage: dumpStorage(sessionStorage),
    };
  }
  if (message.type === "clearWebStorage") {
    localStorage.clear();
    sessionStorage.clear();
    return { ok: true };
  }
  if (message.type === "writeWebStorage") {
    if (message.snapshot.origin !== location.origin) {
      throw new Error("Origin mismatch");
    }
    localStorage.clear();
    sessionStorage.clear();
    for (const [key, value] of Object.entries(message.snapshot.localStorage)) {
      localStorage.setItem(key, value);
    }
    for (const [key, value] of Object.entries(message.snapshot.sessionStorage)) {
      sessionStorage.setItem(key, value);
    }
    return { ok: true };
  }
  throw new Error("Unsupported Web Storage command");
}
