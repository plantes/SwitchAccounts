import type { WebStorageCommand, WebStorageSnapshot } from "../src/domain/models";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    chrome.runtime.onMessage.addListener((message: WebStorageCommand, _sender, sendResponse) => {
      if (message.type === "readWebStorage") {
        sendResponse(snapshotStorage(location.origin));
        return true;
      }
      if (message.type === "clearWebStorage") {
        localStorage.clear();
        sessionStorage.clear();
        sendResponse({ ok: true });
        return true;
      }
      if (message.type === "writeWebStorage") {
        if (message.snapshot.origin !== location.origin) {
          throw new Error("Origin mismatch");
        }
        restoreStorage(message.snapshot);
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });
  },
});

function snapshotStorage(origin: string): WebStorageSnapshot {
  return {
    origin,
    localStorage: dumpStorage(localStorage),
    sessionStorage: dumpStorage(sessionStorage),
  };
}

function restoreStorage(snapshot: WebStorageSnapshot): void {
  localStorage.clear();
  sessionStorage.clear();
  for (const [key, value] of Object.entries(snapshot.localStorage)) {
    localStorage.setItem(key, value);
  }
  for (const [key, value] of Object.entries(snapshot.sessionStorage)) {
    sessionStorage.setItem(key, value);
  }
}

function dumpStorage(storage: Storage): Record<string, string> {
  const data: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) data[key] = storage.getItem(key) ?? "";
  }
  return data;
}
