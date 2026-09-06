import type { ChromeAdapter, DocumentTarget, WebStorageCommand } from "../domain/models";
import { unwrapWebStorageResponse } from "../domain/web-storage";
import { runWebStorageCommandInTab } from "./web-storage-script";

export class BrowserChromeAdapter implements ChromeAdapter {
  async getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return chrome.tabs.get(tabId);
  }

  async getDocumentTarget(tabId: number, expectedOrigin: string): Promise<DocumentTarget> {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => location.origin });
    if (!result?.documentId || result.result !== expectedOrigin) {
      throw { code: "SITE_CHANGED", message: "页面已跳转，请在当前页面重新操作。" };
    }
    return { tabId, documentId: result.documentId, origin: expectedOrigin };
  }

  async containsOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.contains({ origins });
  }

  async requestOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.request({ origins });
  }

  async getCookies(domain: string): Promise<chrome.cookies.Cookie[]> {
    return chrome.cookies.getAll({ domain, partitionKey: {} });
  }

  async removeCookie(details: chrome.cookies.CookieDetails): Promise<void> {
    await chrome.cookies.remove(details);
  }

  async setCookie(details: chrome.cookies.SetDetails): Promise<chrome.cookies.Cookie> {
    const cookie = await chrome.cookies.set(details);
    if (!cookie) throw new Error(`Cookie not set: ${details.name ?? ""}`);
    return cookie;
  }

  async reloadTab(target: DocumentTarget): Promise<void> {
    const message: WebStorageCommand = { type: "switchaccounts:storage:v2", command: "reload", expectedOrigin: target.origin };
    unwrapWebStorageResponse(await this.executeWebStorageCommand(target, message), message);
  }

  async sendTabMessage(target: DocumentTarget, message: WebStorageCommand): Promise<unknown> {
    return chrome.tabs.sendMessage(target.tabId, message, { documentId: target.documentId });
  }

  async executeWebStorageCommand(target: DocumentTarget, message: WebStorageCommand): Promise<unknown> {
    const [result] = await chrome.scripting.executeScript<[string], unknown>({
      target: { tabId: target.tabId, documentIds: [target.documentId] },
      injectImmediately: true,
      func: runWebStorageCommandInTab,
      // Chrome's scripting argument conversion can drop special object keys such as __proto__.
      args: [JSON.stringify(message)],
    });
    if (!result) throw new Error("Web Storage script did not return a result");
    return result.result;
  }

  async getAllOrigins(): Promise<string[]> {
    const permissions = await chrome.permissions.getAll();
    return permissions.origins ?? [];
  }

  async removeOrigins(origins: string[]): Promise<boolean> {
    return chrome.permissions.remove({ origins });
  }
}
