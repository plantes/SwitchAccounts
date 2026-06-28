import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project baseline", () => {
  it("runs the test environment", () => {
    expect(typeof crypto.randomUUID()).toBe("string");
  });

  it("popup buttons include hover and active feedback", () => {
    const css = readFileSync("entrypoints/popup/style.css", "utf8");
    expect(css).toContain("button:not(:disabled):hover");
    expect(css).toContain("button:not(:disabled):active");
  });

  it("popup uses a single vertical scroll container", () => {
    const css = readFileSync("entrypoints/popup/style.css", "utf8");
    expect(css).toMatch(/html,\s*body\s*{[^}]*overflow-y:\s*hidden/s);
    expect(css).toMatch(/\.popup-shell\s*{[^}]*max-height:\s*600px/s);
    expect(css).not.toMatch(/\.popup-shell\s*{[^}]*100vh/s);
    expect(css).toMatch(/\.popup-shell\s*{[^}]*overflow-y:\s*auto/s);
  });

  it("popup scrollbars are styled", () => {
    const css = readFileSync("entrypoints/popup/style.css", "utf8");
    expect(css).toMatch(/\.popup-shell\s*{[^}]*scrollbar-width:\s*thin/s);
    expect(css).toContain(".popup-shell::-webkit-scrollbar");
    expect(css).toContain(".popup-shell::-webkit-scrollbar-thumb");
    expect(css).toContain(".popup-shell::-webkit-scrollbar-thumb:hover");
  });
});
