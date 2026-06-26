import { describe, expect, it } from "vitest";
import { SiteOperationLock } from "../../src/infrastructure/site-lock";

describe("SiteOperationLock", () => {
  it("拒绝同一站点并发写入但允许不同站点", async () => {
    const lock = new SiteOperationLock();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const first = lock.run("example.com", () => blocked);

    await expect(lock.run("example.com", async () => undefined))
      .rejects.toMatchObject({ code: "OPERATION_IN_PROGRESS" });
    await expect(lock.run("other.com", async () => "ok")).resolves.toBe("ok");

    release();
    await first;
  });
});
