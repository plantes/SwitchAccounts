import { createMessageRouter } from "../src/background/message-router";
import { BackgroundOperations } from "../src/background/operations";
import { BrowserChromeAdapter } from "../src/infrastructure/chrome-adapter";
import { ChromeProfileRepository } from "../src/infrastructure/profile-repository";
import { SiteOperationLock } from "../src/infrastructure/site-lock";

export default defineBackground(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error("无法启用侧边栏入口。", error));

  const operations = new BackgroundOperations({
    chrome: new BrowserChromeAdapter(),
    repository: new ChromeProfileRepository(),
    lock: new SiteOperationLock(),
    now: () => new Date().toISOString(),
    uuid: () => crypto.randomUUID(),
  });
  const router = createMessageRouter(operations);
  browser.runtime.onMessage.addListener((message) => router.handle(message));
});
