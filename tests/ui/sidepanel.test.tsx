import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SidePanelApp from "../../entrypoints/sidepanel/App";
import { makeEnvironment } from "../helpers/fixtures";
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

describe("SidePanelApp", () => {
  it("显示工作台空状态并允许保存当前登录状态", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") return result(profile);
      return result({});
    });
    render(<SidePanelApp tabId={1} send={send} />);

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
    render(<SidePanelApp tabId={1} send={send} />);

    expect(await screen.findByRole("textbox", { name: "修改账号标题 Work" })).toHaveValue("Work");
    expect(screen.getByText("2026-06-26 00:00")).toBeInTheDocument();
    expect(screen.queryByText("添加时间")).not.toBeInTheDocument();
    expect(screen.queryByText("已授权")).not.toBeInTheDocument();

    const switchButton = screen.getByRole("button", { name: "切换 Work" });
    const overwriteButton = screen.getByRole("button", { name: "覆盖 Work" });
    const deleteButton = screen.getByRole("button", { name: "删除 Work" });
    expect(switchButton).not.toHaveAttribute("title");
    expect(overwriteButton).not.toHaveAttribute("title");
    expect(deleteButton).not.toHaveAttribute("title");

    await userEvent.hover(switchButton);
    expect(screen.getByRole("tooltip", { name: "使用此账号" })).toBeInTheDocument();
    await userEvent.unhover(switchButton);
    await userEvent.hover(overwriteButton);
    expect(screen.getByRole("tooltip", { name: "覆盖已存储的快照" })).toBeInTheDocument();
    await userEvent.unhover(overwriteButton);
    await userEvent.hover(deleteButton);
    expect(screen.queryByRole("tooltip", { name: "无" })).not.toBeInTheDocument();

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

  it("允许直接在侧边栏修改账号标题", async () => {
    const env = makeEnvironment();
    const send = vi.fn(env.router.handle);
    const view = render(<SidePanelApp tabId={1} send={send} />);

    const title = await screen.findByRole("textbox", { name: "修改账号标题 Work" });
    await userEvent.click(title);
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("小号 月卡 18号{Enter}");

    await waitFor(() => expect(send).toHaveBeenCalledWith({
      type: "renameProfile",
      profileId: profile.id,
      name: "小号 月卡 18号",
    }));
    expect(await screen.findByLabelText("修改账号标题 小号 月卡 18号")).toHaveValue("小号 月卡 18号");
    expect(env.state().profiles[0]).toMatchObject({
      name: "小号 月卡 18号", normalizedName: "小号 月卡 18号",
      cookies: [{ value: "old" }],
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    view.unmount();
    render(<SidePanelApp tabId={1} send={send} />);
    expect(await screen.findByLabelText("修改账号标题 小号 月卡 18号")).toHaveValue("小号 月卡 18号");
  });
});

describe("SidePanelApp floating errors", () => {
  it("allows dismissing the floating side panel error", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") throw new Error("Cookie write failed");
      return result({});
    });
    render(<SidePanelApp tabId={1} send={send} />);

    await screen.findByText("暂无账号快照");
    await userEvent.type(screen.getByLabelText("账号名称"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("floating-alert");
    expect(alert).toHaveTextContent("Cookie write failed");

    await userEvent.click(screen.getByRole("button", { name: "关闭错误提示" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SidePanelApp error recovery", () => {
  it("初次加载消息异常时显示错误，并允许重试恢复", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      return result([profile]);
    });
    send.mockRejectedValueOnce(new Error("后台连接中断"));
    render(<SidePanelApp tabId={1} send={send} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("后台连接中断");
    await userEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByLabelText("修改账号标题 Work")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("切换到不支持的页面时清除旧站点和旧账号操作入口", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") {
        return request.tabId === 1 ? result(site) : { ok: false as const, error: { code: "UNSUPPORTED_PAGE" as const, message: "当前页面不支持账号操作。" } };
      }
      return result([profile]);
    });
    const view = render(<SidePanelApp tabId={1} send={send} />);
    await screen.findByLabelText("修改账号标题 Work");
    view.rerender(<SidePanelApp tabId={2} send={send} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("不支持账号操作");
    expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("修改账号标题 Work")).not.toBeInTheDocument();
  });

  it("旧标签页迟到的响应不能覆盖新标签页", async () => {
    let release!: (value: OperationResult<CurrentSiteData>) => void;
    const oldResponse = new Promise<OperationResult<CurrentSiteData>>(resolve => { release = resolve; });
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") {
        return request.tabId === 1 ? oldResponse : { ok: false as const, error: { code: "UNSUPPORTED_PAGE" as const, message: "当前页面不支持账号操作。" } };
      }
      return result([profile]);
    });
    const view = render(<SidePanelApp tabId={1} send={send} />);
    view.rerender(<SidePanelApp tabId={2} send={send} />);
    await screen.findByRole("alert");
    await act(async () => { release(result(site)); });
    expect(screen.queryByRole("button", { name: "登出" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("不支持账号操作");
  });

  it("保存账号消息异常时显示错误并恢复按钮", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") throw new Error("This function must be called during a user gesture");
      return result({});
    });
    render(<SidePanelApp tabId={1} send={send} />);

    await screen.findByText("暂无账号快照");
    await userEvent.type(screen.getByLabelText("账号名称"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This function must be called during a user gesture");
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("首次保存账号时先在侧边栏用户手势内申请站点权限", async () => {
    const unauthorizedSite: CurrentSiteData = { ...site, authorized: false };
    const requestPermission = vi.fn(async () => true);
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(unauthorizedSite);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") return result(profile);
      return result({});
    });
    render(<SidePanelApp tabId={1} send={send} requestPermission={requestPermission} />);

    const user = userEvent.setup();
    await screen.findByText("暂无账号快照");
    await user.type(screen.getByLabelText("账号名称"), "Work");
    await waitFor(() => expect(screen.getByLabelText("账号名称")).toHaveValue("Work"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requestPermission).toHaveBeenCalledWith(site.scope.permissionOrigins));
    expect(send).toHaveBeenCalledWith({ type: "createProfile", tabId: 1, name: "Work" });
  });
});
