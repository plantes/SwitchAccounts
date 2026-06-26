import { describe, expect, it, vi } from "vitest";
import { createMessageRouter } from "../../src/background/message-router";

describe("message router", () => {
  it("未知消息返回结构化错误", async () => {
    const router = createMessageRouter({} as never);
    await expect(router.handle({ type: "wat" })).resolves.toMatchObject({
      ok: false,
      error: { code: "IMPORT_INVALID" },
    });
  });

  it("合法消息分发到后台操作", async () => {
    const operations = {
      listProfiles: vi.fn(async () => ({ ok: true, data: [] })),
    };
    const router = createMessageRouter(operations as never);
    await expect(router.handle({ type: "listProfiles", registrableDomain: "example.com" }))
      .resolves.toEqual({ ok: true, data: [] });
    expect(operations.listProfiles).toHaveBeenCalledWith("example.com");
  });

  it("不信任不完整负载", async () => {
    const operations = { createProfile: vi.fn() };
    const router = createMessageRouter(operations as never);
    await expect(router.handle({ type: "createProfile", name: "A" })).resolves.toMatchObject({
      ok: false,
      error: { code: "IMPORT_INVALID" },
    });
    expect(operations.createProfile).not.toHaveBeenCalled();
  });
});
