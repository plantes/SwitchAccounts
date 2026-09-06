import type { OperationResult, WebStorageCommand, WebStorageSnapshot } from "../domain/models";

// This function is also serialized by executeScript: keep all runtime dependencies inside it.
export function runWebStorageCommandInTab(input: WebStorageCommand | string): OperationResult<WebStorageSnapshot | true> {
  const message: WebStorageCommand = typeof input === "string" ? JSON.parse(input) : input;
  if (!["read", "clear", "write", "check", "reload"].includes(message.command)) {
    return { ok: false, error: { code: "IMPORT_INVALID", message: "未知页面存储操作。" } };
  }
  if (message.expectedOrigin !== location.origin) {
    return { ok: false, error: { code: "SITE_CHANGED", message: "页面已跳转，请在当前页面重新操作。" } };
  }
  function dump(storage: Storage): Record<string, string> {
    const values: Record<string, string> = Object.create(null);
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) values[key] = storage.getItem(key) ?? "";
    }
    return values;
  }
  try {
    if (message.command === "read") {
      return { ok: true, data: { origin: location.origin, localStorage: dump(localStorage), sessionStorage: dump(sessionStorage) } };
    }
    if (message.command === "check") return { ok: true, data: true };
    if (message.command === "reload") {
      // The callback belongs to this document and cannot reload a newly navigated document.
      setTimeout(() => location.reload(), 0);
      return { ok: true, data: true };
    }
    if (message.command === "write" && message.snapshot.origin !== location.origin) {
      return { ok: false, error: { code: "SITE_CHANGED", message: "页面已跳转，请在当前页面重新操作。" } };
    }
    localStorage.clear();
    sessionStorage.clear();
    if (message.command === "write") {
      for (const [key, value] of Object.entries(message.snapshot.localStorage)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(message.snapshot.sessionStorage)) sessionStorage.setItem(key, value);
    }
    return { ok: true, data: true };
  } catch {
    const code = message.command === "read" ? "WEB_STORAGE_READ_FAILED"
      : message.command === "write" ? "WEB_STORAGE_WRITE_FAILED" : "WEB_STORAGE_CLEAR_FAILED";
    return { ok: false, error: { code, message: "页面存储操作失败，请检查网站存储权限或容量后重试。" } };
  }
}
