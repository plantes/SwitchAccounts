import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OptionsApp, { formatExportFileName } from "../../entrypoints/options/App";
import type { AccountProfile, OperationResult } from "../../src/domain/models";

const profile: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Work",
  normalizedName: "work",
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

const homeProfile: AccountProfile = {
  ...profile,
  id: "00000000-0000-4000-8000-000000000002",
  name: "Home",
  normalizedName: "home",
  registrableDomain: "example.org",
  cookies: [],
  webStorageByOrigin: {},
};

function result<T>(data: T): OperationResult<T> {
  return { ok: true, data };
}

describe("OptionsApp", () => {
  it("导出文件名包含可排序的本地时间戳", () => {
    expect(formatExportFileName(new Date(2026, 8, 3, 21, 45, 7)))
      .toBe("switchaccounts-backup-20260903-214507.json");
  });

  it("使用侧边栏工作台同款品牌栏", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    const { container } = render(<OptionsApp send={send} />);

    expect(await screen.findByText("SwitchAccounts")).toBeInTheDocument();
    expect(screen.getByText("本地账号快照工作台")).toBeInTheDocument();
    const mark = container.querySelector<HTMLImageElement>(".brand-mark");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("src")).toBe("/icons/switchaccounts.svg");
  });

  it("按网站和账号展示配置，普通搜索不匹配敏感值", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);
    expect(await screen.findByText("SwitchAccounts")).toBeInTheDocument();
    expect(await screen.findByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText("secret-cookie-value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("secret-cookie-value")).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
    expect(await screen.findByText("sid")).toBeInTheDocument();
    expect(screen.getByText(".example.com")).toBeInTheDocument();
    const valueEditor = screen.getByDisplayValue("secret-cookie-value");
    expect(valueEditor.tagName).toBe("TEXTAREA");
    expect(document.querySelector("input[type='password']")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "工具" }));
    expect(screen.getByText("配置文件包含登录凭证")).toBeInTheDocument();
  });
  it("Web Storage 值用 textarea 明文显示并格式化 JSON", async () => {
    const jsonProfile: AccountProfile = {
      ...profile,
      webStorageByOrigin: {
        "https://app.example.com": {
          origin: "https://app.example.com",
          localStorage: { account: "{\"user\":\"odin_tt\",\"roles\":[\"admin\",\"editor\"]}" },
          sessionStorage: {},
        },
      },
    };
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([jsonProfile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("tab", { name: "Web Storage" }));

    const formattedValue = '{\n  "user": "odin_tt",\n  "roles": [\n    "admin",\n    "editor"\n  ]\n}';
    await waitFor(() => {
      const valueEditor = Array.from(document.querySelectorAll("textarea"))
        .find((textarea) => textarea.value === formattedValue);
      expect(valueEditor).toBeDefined();
      expect(valueEditor?.tagName).toBe("TEXTAREA");
    });
  });
});

describe("OptionsApp v1 管理能力", () => {
  it("Cookie 编辑器允许维护 SameSite 和过期时间", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
    await screen.findByDisplayValue("sid");
    await userEvent.selectOptions(screen.getByLabelText("SameSite"), "strict");

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        type: "updateProfile",
        profile: expect.objectContaining({
          cookies: [expect.objectContaining({ sameSite: "strict" })],
        }),
      }));
    });
    expect(screen.getByLabelText("Expiration")).toBeInTheDocument();
  });

  it("Web Storage 编辑器允许在既有 origin 下新增条目", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("tab", { name: "Web Storage" }));
    await screen.findByText("https://app.example.com");
    await userEvent.type(screen.getByPlaceholderText("storage key"), "theme");
    await userEvent.type(screen.getByPlaceholderText("storage value"), "dark");
    await userEvent.click(screen.getByRole("button", { name: "添加 localStorage" }));

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        type: "updateProfile",
        profile: expect.objectContaining({
          webStorageByOrigin: expect.objectContaining({
            "https://app.example.com": expect.objectContaining({
              localStorage: expect.objectContaining({ theme: "dark" }),
            }),
          }),
        }),
      }));
    });
  });

  it("导入前基于当前仓库显示新增、覆盖和站点预览", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const incomingProfile: AccountProfile = {
      ...profile,
      id: "00000000-0000-4000-8000-000000000002",
      name: "Home",
      normalizedName: "home",
      registrableDomain: "example.org",
      cookies: [{ ...profile.cookies[0]!, domain: ".example.org" }],
      webStorageByOrigin: {
        "https://app.example.org": {
          origin: "https://app.example.org",
          localStorage: {},
          sessionStorage: {},
        },
      },
    };
    const bundle = {
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: "2026-06-26T00:00:00.000Z",
      profiles: [profile, incomingProfile],
    };
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await screen.findByText("example.com");
    await userEvent.click(screen.getByRole("button", { name: "工具" }));
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();
    await userEvent.upload(input!, new File([JSON.stringify(bundle)], "profiles.json", { type: "application/json" }));

    expect(await screen.findByText(/新增 1 个/)).toBeInTheDocument();
    expect(screen.getByText(/覆盖 1 个/)).toBeInTheDocument();
    expect(screen.getByText(/涉及站点：example\.com, example\.org/)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "importProfiles" }));
  });

  it("没有账号时仍然可以打开工具页导入配置", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("button", { name: "打开工具与设置" }));

    expect(screen.getByRole("heading", { name: "工具与设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "导入账号配置" })).toBeInTheDocument();
  });

  it("工具工作区支持拖放 JSON 文件", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("button", { name: "工具" }));
    fireEvent.drop(screen.getByLabelText("导入 JSON 文件拖放区"), {
      dataTransfer: { files: [new File(["not-json"], "invalid.json", { type: "application/json" })] },
    });

    expect(await screen.findByText("导入文件无效，未写入任何配置。")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "importProfiles" }));
  });

  it("默认使用概览标签，并允许在账号详情标签之间切换", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    expect(await screen.findByRole("tab", { name: "概览" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Cookie" }));
    expect(screen.getByRole("tabpanel", { name: "Cookie" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Web Storage" }));
    expect(screen.getByRole("tabpanel", { name: "Web Storage" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "工具" })).not.toBeInTheDocument();
  });

  it("切到工具工作区后隐藏账号列表列，并可切回账号工作区", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile, homeProfile]);
      if (request.type === "listGrantedSites") return result(["https://example.com/*"]);
      return result({});
    });
    const { container } = render(<OptionsApp send={send} />);

    await screen.findByLabelText("管理页搜索");
    await userEvent.click(screen.getByRole("button", { name: "工具" }));

    expect(container.querySelector(".options-shell")).toHaveClass("tools-mode");
    expect(screen.getByRole("heading", { name: "工具与设置" })).toBeInTheDocument();
    expect(screen.queryByLabelText("管理页搜索")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "账号快照" })).not.toBeInTheDocument();
    expect(screen.queryByText("当前账号")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "概览" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "账号" }));
    expect(container.querySelector(".options-shell")).toHaveClass("accounts-mode");
    expect(screen.getByLabelText("管理页搜索")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "概览" })).toBeInTheDocument();
  });

  it("允许勾选多个账号后按所选范围导出", async () => {
    const exportedAt = "2026-09-03T13:45:07.000Z";
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile, homeProfile]);
      if (request.type === "listGrantedSites") return result([]);
      if (request.type === "exportProfiles") return result({
        format: "switchaccounts" as const,
        schemaVersion: 2 as const,
        exportedAt,
        profiles: [profile],
      });
      return result({});
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const createObjectURL = vi.fn(() => "blob:export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("button", { name: "工具" }));
    expect(screen.getByText("已选择", { exact: false })).toHaveTextContent("已选择 2 / 2");
    await userEvent.click(screen.getByRole("checkbox", { name: "选择导出账号 Home" }));
    expect(screen.getByText("已选择", { exact: false })).toHaveTextContent("已选择 1 / 2");
    await userEvent.click(screen.getByRole("button", { name: "导出已选账号" }));

    expect(send).toHaveBeenCalledWith({
      type: "exportProfiles",
      scope: { type: "profiles", profileIds: [profile.id] },
    });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("将导出 1 个账号"));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("未选择账号时禁用导出按钮", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile, homeProfile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await userEvent.click(await screen.findByRole("button", { name: "工具" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "全选账号" }));

    expect(screen.getByRole("button", { name: "导出已选账号" })).toBeDisabled();
    expect(screen.getByText("已选择", { exact: false })).toHaveTextContent("已选择 0 / 2");
  });

  it("从左侧账号导航选择账号后，详情区显示对应账号", async () => {
    const send = vi.fn(async (request) => {
      if (request.type === "listAllProfiles") return result([profile, homeProfile]);
      if (request.type === "listGrantedSites") return result([]);
      return result({});
    });
    render(<OptionsApp send={send} />);

    await screen.findByRole("button", { name: /Work/ });
    await userEvent.click(screen.getByRole("button", { name: /Home/ }));

    expect(screen.getByLabelText("账号名称")).toHaveValue("Home");
  });
});
