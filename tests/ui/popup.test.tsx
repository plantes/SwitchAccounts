import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PopupApp from "../../entrypoints/popup/App";
import type { AccountProfile, CurrentSiteData, OperationResult } from "../../src/domain/models";

const site: CurrentSiteData = {
  authorized: true,
  scope: {
    registrableDomain: "example.com",
    currentOrigin: "https://app.example.com",
    hostname: "app.example.com",
    permissionOrigins: [],
  },
};

const profile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Work",
  normalizedName: "work",
  registrableDomain: "example.com",
  cookies: [],
  webStorageByOrigin: {},
  createdAt: "2026-06-26T00:00:00.000Z",
  updatedAt: "2026-06-26T00:00:00.000Z",
};

function result<T>(data: T): OperationResult<T> {
  return { ok: true, data };
}

describe("PopupApp", () => {
  it("显示工作台空状态并允许保存当前登录状态", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") return result(profile);
      return result({});
    });
    render(<PopupApp tabId={1} send={send} />);

    expect(await screen.findByRole("heading", { name: "SwitchAccounts" })).toBeInTheDocument();
    expect(screen.getByText("app.example.com")).toBeInTheDocument();
    expect(screen.getByText("注册域 example.com · Cookie 覆盖全部子域")).toBeInTheDocument();
    expect(screen.getByText("暂无账号快照")).toBeInTheDocument();
    expect(screen.queryByLabelText("备" + "注")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("账号名称"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "createProfile", tabId: 1, name: "Work" }));
  });

  it("有账号时支持搜索、切换、覆盖、删除和登出确认", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([profile]);
      return result({});
    });
    render(<PopupApp tabId={1} send={send} />);

    expect(await screen.findByText("Work")).toBeInTheDocument();
    expect(screen.getByText("2026-06-26 00:00")).toBeInTheDocument();
    expect(screen.queryByText("添加时间")).not.toBeInTheDocument();
    expect(screen.queryByText("已授权")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("搜索账号"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "切换 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "覆盖 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "删除 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "登出" }));

    expect(send).toHaveBeenCalledWith({ type: "switchProfile", tabId: 1, profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "overwriteProfile", tabId: 1, profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "deleteProfile", profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "resetSite", tabId: 1 });
  });
});

describe("PopupApp error recovery", () => {
  it("保存账号消息异常时显示错误并恢复按钮", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") throw new Error("This function must be called during a user gesture");
      return result({});
    });
    render(<PopupApp tabId={1} send={send} />);

    await screen.findByText("暂无账号快照");
    await userEvent.type(screen.getByLabelText("账号名称"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This function must be called during a user gesture");
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("首次保存账号时先在 Popup 用户手势内申请站点权限", async () => {
    const unauthorizedSite: CurrentSiteData = { ...site, authorized: false };
    const requestPermission = vi.fn(async () => true);
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(unauthorizedSite);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") return result(profile);
      return result({});
    });
    render(<PopupApp tabId={1} send={send} requestPermission={requestPermission} />);

    const user = userEvent.setup();
    await screen.findByText("暂无账号快照");
    await user.type(screen.getByLabelText("账号名称"), "Work");
    await waitFor(() => expect(screen.getByLabelText("账号名称")).toHaveValue("Work"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalledWith(site.scope.permissionOrigins));
    expect(send).toHaveBeenCalledWith({ type: "createProfile", tabId: 1, name: "Work" });
  });
});
