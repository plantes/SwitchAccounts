import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import OptionsApp from "../../entrypoints/options/App";
import SidePanelApp from "../../entrypoints/sidepanel/App";
import { baseProfile, makeEnvironment, secondProfile, now } from "../helpers/fixtures";
import { buildExportBundle } from "../../src/domain/import-export";
import type { BackgroundRequest } from "../../src/domain/models";

it("按域名可以找到名称不同的账号，仍不搜索凭证值", async () => {
  const env = makeEnvironment();
  render(<OptionsApp send={r => env.router.handle(r)} />);
  await screen.findByRole("button", { name: /Work/ });
  fireEvent.change(screen.getByLabelText("管理页搜索"), { target: { value: "example.com" } });
  expect(screen.getByRole("button", { name: /Work/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("管理页搜索"), { target: { value: "old" } });
  expect(screen.queryByRole("button", { name: /Work/ })).not.toBeInTheDocument();
});

it("连续输入完整保留，只在明确保存时写入后台", async () => {
  const env = makeEnvironment();
  const send = vi.fn((r: BackgroundRequest) => env.router.handle(r));
  render(<OptionsApp send={send} />);
  await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
  const input = screen.getByLabelText("值");
  await userEvent.type(input, "abc");
  expect(input).toHaveValue("oldabc");
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "updateProfile" }));
  await userEvent.click(screen.getByRole("button", { name: "保存 Cookie 修改" }));
  await waitFor(() => expect(env.state().profiles[0]!.cookies[0]!.value).toBe("oldabc"));
});

it("Cookie 名称、域名和路径编辑时输入框不重建", async () => {
  const env = makeEnvironment();
  render(<OptionsApp send={r => env.router.handle(r)} />);
  await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
  for (const label of ["名称", "域名", "路径"]) {
    const input = screen.getByLabelText(label);
    await userEvent.type(input, "abc");
    expect(screen.getByLabelText(label)).toBe(input);
    expect(input).toHaveFocus();
  }
});

it("保存错误显示原因并保留草稿，修正后可成功保存", async () => {
  const env = makeEnvironment([baseProfile, secondProfile]);
  render(<OptionsApp send={r => env.router.handle(r)} />);
  const name = await screen.findByLabelText("账号名称");
  fireEvent.change(name, { target: { value: "Home" } });
  await userEvent.click(screen.getByRole("button", { name: "保存账号信息" }));
  await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent("账号名称不能重复"));
  expect(name).toHaveValue("Home");
  expect(env.state().profiles[0]!.name).toBe("Work");
  fireEvent.change(name, { target: { value: "New" } });
  await userEvent.click(screen.getByRole("button", { name: "保存账号信息" }));
  await waitFor(() => expect(env.state().profiles[0]!.name).toBe("New"));
});

it("存储保存失败保留新增项并允许重试，未保存离开会确认", async () => {
  const env = makeEnvironment();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<OptionsApp send={r => env.router.handle(r)} />);
  await userEvent.click(await screen.findByRole("tab", { name: "Web Storage" }));
  await userEvent.type(screen.getByPlaceholderText("storage key"), "theme");
  await userEvent.type(screen.getByPlaceholderText("storage value"), "dark");
  await userEvent.click(screen.getByRole("button", { name: "添加 localStorage" }));
  env.storage.set.mockRejectedValueOnce(new Error("disk full"));
  await userEvent.click(screen.getByRole("button", { name: "保存 Web Storage 修改" }));
  await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent("写入失败"));
  expect(screen.getByLabelText("localStorage theme")).toHaveValue("dark");
  await userEvent.click(screen.getByRole("tab", { name: "Cookie" }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: "Web Storage" })).toHaveAttribute("aria-selected", "true");
  await userEvent.click(screen.getByRole("button", { name: "保存 Web Storage 修改" }));
  await waitFor(() => expect(env.state().profiles[0]!.webStorageByOrigin["https://example.com"]!.localStorage.theme).toBe("dark"));
});

it("旧编辑草稿冲突时不覆盖新值，重新载入后可继续", async () => {
  const env = makeEnvironment();
  render(<OptionsApp send={r => env.router.handle(r)} />);
  await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
  await userEvent.type(screen.getByLabelText("值"), "draft");
  await env.ops.updateProfile({ ...baseProfile, cookies: [{ ...baseProfile.cookies[0]!, value: "latest" }] });
  await userEvent.click(screen.getByRole("button", { name: "保存 Cookie 修改" }));
  await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent("其他位置修改"));
  expect(screen.getByLabelText("值")).toHaveValue("olddraft");
  expect(env.state().profiles[0]!.cookies[0]!.value).toBe("latest");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "重新载入" }));
  await waitFor(() => expect(screen.getByLabelText("值")).toHaveValue("latest"));
});

it("JSON 格式化不损坏大整数，输入时不反复格式化", async () => {
  const value = '{"id":9007199254740993123,"nested":[],"str":"a\\\"b"}';
  const env = makeEnvironment([{ ...baseProfile, cookies: [{ ...baseProfile.cookies[0]!, value }] }]);
  render(<OptionsApp send={r => env.router.handle(r)} />);
  await userEvent.click(await screen.findByRole("tab", { name: "Cookie" }));
  const input = screen.getByLabelText("值");
  expect((input as HTMLTextAreaElement).value).toContain("9007199254740993123");
  await userEvent.type(input, " ");
  expect((input as HTMLTextAreaElement).value.endsWith(" ")).toBe(true);
});

it("导入先显示预览，确认前不写入，可取消和再次选择同一文件", async () => {
  const env = makeEnvironment();
  const send = vi.fn((r: BackgroundRequest) => env.router.handle(r));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<OptionsApp send={send} />);
  await userEvent.click(await screen.findByRole("button", { name: "工具" }));
  const file = new File([JSON.stringify(buildExportBundle([secondProfile], now))], "backup.json", { type: "application/json" });
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  await userEvent.upload(input, file);
  expect(await screen.findByText(/新增 1 个，覆盖 0 个/)).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
  expect(env.state().profiles).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "取消导入" }));
  await userEvent.upload(input, file);
  await userEvent.click(await screen.findByRole("button", { name: "确认导入" }));
  expect(await screen.findByText("导入成功。")).toBeInTheDocument();
  expect(env.state().profiles).toHaveLength(2);
});

it("Escape 取消标题修改，而 Enter 只提交名称", async () => {
  const env = makeEnvironment();
  const send = vi.fn((r: BackgroundRequest) => env.router.handle(r));
  render(<SidePanelApp tabId={1} send={send} />);
  const input = await screen.findByLabelText("修改账号标题 Work");
  await userEvent.type(input, "Changed");
  await userEvent.keyboard("{Escape}");
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "renameProfile" }));
  expect(input).toHaveValue("Work");
  await act(async () => { input.focus(); });
  await userEvent.type(input, "New");
  await userEvent.keyboard("{Enter}");
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "renameProfile", profileId: baseProfile.id, name: "WorkNew" }));
});
