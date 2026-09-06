import type { OperationResult, WebStorageCommand, WebStorageSnapshot } from "./models";
import { WebStorageSnapshotSchema } from "./schemas";

export function unwrapWebStorageResponse(raw: unknown, message: WebStorageCommand): WebStorageSnapshot | true {
  const response = raw as OperationResult<unknown> | null;
  if (response?.ok === false && response.error && typeof response.error.message === "string") throw response.error;
  if (response?.ok === true) {
    if (message.command !== "read" && response.data === true) return true;
    if (message.command === "read") {
      const parsed = WebStorageSnapshotSchema.safeParse(response.data);
      if (parsed.success && parsed.data.origin === message.expectedOrigin) return parsed.data;
    }
  }
  throw {
    code: message.command === "read" ? "WEB_STORAGE_READ_FAILED"
      : message.command === "write" ? "WEB_STORAGE_WRITE_FAILED" : "WEB_STORAGE_CLEAR_FAILED",
    message: "页面未确认存储操作成功，请重新操作。",
  };
}
