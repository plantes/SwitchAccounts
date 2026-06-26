import { describe, expect, it } from "vitest";

describe("project baseline", () => {
  it("runs the test environment", () => {
    expect(typeof crypto.randomUUID()).toBe("string");
  });
});
