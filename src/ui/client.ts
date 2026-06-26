import type { BackgroundRequest, OperationResult } from "../domain/models";

export async function sendBackground<T>(request: BackgroundRequest): Promise<OperationResult<T>> {
  return browser.runtime.sendMessage(request) as Promise<OperationResult<T>>;
}
