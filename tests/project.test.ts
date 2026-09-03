import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project baseline", () => {
  it("runs the test environment", () => {
    expect(typeof crypto.randomUUID()).toBe("string");
  });

  it("side panel buttons include hover and active feedback", () => {
    const css = readFileSync("entrypoints/sidepanel/style.css", "utf8");
    expect(css).toContain("button:not(:disabled):hover");
    expect(css).toContain("button:not(:disabled):active");
  });

  it("side panel uses a full-height vertical scroll container", () => {
    const css = readFileSync("entrypoints/sidepanel/style.css", "utf8");
    expect(css).toMatch(/html,\s*body\s*{[^}]*overflow-y:\s*hidden/s);
    expect(css).toMatch(/\.sidepanel-shell\s*{[^}]*height:\s*100vh/s);
    expect(css).toMatch(/\.sidepanel-shell\s*{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.sidepanel-shell\s*{[^}]*overflow-y:\s*auto/s);
  });

  it("side panel scrollbars are styled", () => {
    const css = readFileSync("entrypoints/sidepanel/style.css", "utf8");
    expect(css).toMatch(/\.sidepanel-shell\s*{[^}]*scrollbar-width:\s*thin/s);
    expect(css).toContain(".sidepanel-shell::-webkit-scrollbar");
    expect(css).toContain(".sidepanel-shell::-webkit-scrollbar-thumb");
    expect(css).toContain(".sidepanel-shell::-webkit-scrollbar-thumb:hover");
  });

  it("uses a side panel entrypoint instead of a popup entrypoint", () => {
    expect(() => readFileSync("entrypoints/sidepanel/index.html", "utf8")).not.toThrow();
    expect(() => readFileSync("entrypoints/popup/index.html", "utf8")).toThrow();
  });

  it("opens the side panel when the toolbar action is clicked", () => {
    const config = readFileSync("wxt.config.ts", "utf8");
    const background = readFileSync("entrypoints/background.ts", "utf8");
    expect(config).toContain('"sidePanel"');
    expect(config).toContain('"tabs"');
    expect(config).not.toContain('"activeTab"');
    expect(background).toContain("openPanelOnActionClick: true");
  });
});
