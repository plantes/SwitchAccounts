import type { WebStorageCommand } from "../src/domain/models";
import { runWebStorageCommandInTab } from "../src/infrastructure/web-storage-script";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    chrome.runtime.onMessage.addListener((message: WebStorageCommand, _sender, sendResponse) => {
      if (message?.type !== "switchaccounts:storage:v2") return false;
      sendResponse(runWebStorageCommandInTab(message));
      return false;
    });
  },
});
