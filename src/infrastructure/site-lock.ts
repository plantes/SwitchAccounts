import type { OperationError } from "../domain/models";

export class SiteOperationLock {
  private readonly active = new Set<string>();

  async run<T>(domain: string, operation: () => Promise<T>): Promise<T> {
    if (this.active.has(domain)) {
      const error: OperationError = {
        code: "OPERATION_IN_PROGRESS",
        message: "当前网站已有操作正在进行。",
      };
      throw error;
    }

    this.active.add(domain);
    try {
      return await operation();
    } finally {
      this.active.delete(domain);
    }
  }
}
