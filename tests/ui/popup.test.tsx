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
  note: "团队",
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
  it("显示无账号状态并允许新增账号", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([]);
      if (request.type === "createProfile") return result(profile);
      return result({});
    });
    render(<PopupApp tabId={1} send={send} />);
    expect(await screen.findByText("暂无账号配置")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("账号名称"), "Work");
    await userEvent.click(screen.getByRole("button", { name: "新增账号" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "createProfile", tabId: 1, name: "Work", note: "" }));
  });

  it("有账号时支持搜索、切换、覆盖、删除和重置确认", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const send = vi.fn(async (request) => {
      if (request.type === "getCurrentSite") return result(site);
      if (request.type === "listProfiles") return result([profile]);
      return result({});
    });
    render(<PopupApp tabId={1} send={send} />);
    expect(await screen.findByText("Work")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("搜索账号"), "团队");
    await userEvent.click(screen.getByRole("button", { name: "切换 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "覆盖 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "删除 Work" }));
    await userEvent.click(screen.getByRole("button", { name: "重置当前状态" }));
    expect(send).toHaveBeenCalledWith({ type: "switchProfile", tabId: 1, profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "overwriteProfile", tabId: 1, profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "deleteProfile", profileId: profile.id });
    expect(send).toHaveBeenCalledWith({ type: "resetSite", tabId: 1 });
  });
});
