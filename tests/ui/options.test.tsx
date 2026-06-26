import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OptionsApp from "../../entrypoints/options/App";
import type { AccountProfile, OperationResult } from "../../src/domain/models";

const profile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Work",
  normalizedName: "work",
  note: "团队",
  registrableDomain: "example.com",
  cookies: [{
    name: "sid",
    value: "secret-cookie-value",
    domain: ".example.com",
    hostOnly: false,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    session: true,
    storeId: "0",
  }],
  webStorageByOrigin: {
    "https://app.example.com": {
      origin: "https://app.example.com",
      localStorage: { account: "secret-storage-value" },
      sessionStorage: {},
    },
  },
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

function result<T>(data: T): OperationResult<T> {
  return { ok: true, data };
}

describe("OptionsApp", () => {
  it("按网站和账号展示配置，普通搜索不匹配敏感值", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);
    expect(await screen.findByText("example.com")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("管理页搜索"), "secret-cookie-value");
    await waitFor(() => expect(screen.queryByText("Work")).not.toBeInTheDocument());
  });

  it("Cookie 编辑器显示元信息但不直接展示敏感值", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result(["https://example.com/*"]);
      return result({});
    });
    render(<OptionsApp send={send} />);
    expect(await screen.findByText("sid")).toBeInTheDocument();
    expect(screen.getByText(".example.com")).toBeInTheDocument();
    expect(screen.queryByText("secret-cookie-value")).not.toBeInTheDocument();
    expect(screen.getByText(/导出文件包含可直接使用的登录凭证/)).toBeInTheDocument();
  });
});
