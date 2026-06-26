import { describe, expect, it } from "vitest";
import { resolveSiteScope } from "../../src/domain/site-scope";

describe("resolveSiteScope", () => {
  it.each([
    ["https://app.example.co.uk:8443/a", "example.co.uk", "https://app.example.co.uk:8443"],
    ["https://foo.github.io/a", "foo.github.io", "https://foo.github.io"],
    ["http://localhost:3000", "localhost", "http://localhost:3000"],
    ["http://127.0.0.1:8080", "127.0.0.1", "http://127.0.0.1:8080"],
  ])("解析 %s", (url, domain, origin) => {
    expect(resolveSiteScope(url)).toEqual({
      ok: true,
      data: expect.objectContaining({
        registrableDomain: domain,
        currentOrigin: origin,
      }),
    });
  });

  it.each([
    "chrome://settings",
    "https://chromewebstore.google.com/detail/example",
    "file:///tmp/a",
  ])("拒绝特殊页面 %s", (url) => {
    expect(resolveSiteScope(url)).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_PAGE" },
    });
  });

  it("生成主域和全部子域的 HTTP/HTTPS 权限", () => {
    const result = resolveSiteScope("https://app.example.com");
    expect(result.ok && result.data.permissionOrigins).toEqual([
      "http://example.com/*",
      "http://*.example.com/*",
      "https://example.com/*",
      "https://*.example.com/*",
    ]);
  });
});
