# SwitchAccounts V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于 Chrome Manifest V3 的 WXT 扩展，使用户可保存、编辑、导入导出并可靠切换同一注册域下的多个登录状态。

**Architecture:** Popup 与 Options 只负责交互，通过类型化消息调用 Background Service Worker。后台统一处理权限、站点范围、Cookie、Web Storage、仓库存储和同站点写锁；Content Script 只执行当前 origin 的 Web Storage 操作。业务逻辑拆成可独立单测的领域模块和 Chrome API 适配层。

**Tech Stack:** WXT、React、TypeScript、Chrome Manifest V3、Vitest、React Testing Library、Playwright、tldts、Zod

---

## 文件结构

```text
entrypoints/
  background.ts                 # 消息入口与业务依赖装配
  content.ts                    # Web Storage 消息处理
  popup/
    index.html
    main.tsx
    App.tsx                     # 当前站点快捷操作
  options/
    index.html
    main.tsx
    App.tsx                     # 完整管理页
src/
  components/                   # 可复用表单、对话框、状态展示
  domain/
    models.ts                   # 数据模型与结果类型
    site-scope.ts               # URL、注册域、权限范围解析
    cookies.ts                  # Cookie 规范化、校验、恢复参数
    profiles.ts                 # 名称规范化、快照与搜索规则
    import-export.ts            # 导入验证、冲突合并、导出筛选
  infrastructure/
    chrome-adapter.ts           # Chrome API Promise 适配
    profile-repository.ts       # chrome.storage.local 原子仓库
    site-lock.ts                # 注册域级写操作串行化
    web-storage-client.ts       # 后台到 Content Script 的调用
  background/
    operations.ts               # 新增、覆盖、切换、重置、删除编排
    message-router.ts           # 运行时消息验证与分发
  ui/
    client.ts                   # UI 到后台的类型化消息客户端
    errors.ts                   # 安全错误文案
tests/
  unit/                         # 领域与仓库单元测试
  background/                   # 后台流程测试
  ui/                           # React Testing Library 测试
  e2e/                          # Playwright 扩展验收
  fixtures/site/                # 主域/子域本地测试站点
```

## Task 1：创建 WXT React 工程与测试基线

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `.gitignore`

- [ ] **Step 1: 初始化 WXT React 模板**

Run:

```powershell
pnpm dlx wxt@latest init . --template react
pnpm install
```

Expected: 生成可运行的 WXT React 工程，`pnpm compile` 成功。

- [ ] **Step 2: 安装领域、测试和端到端依赖**

Run:

```powershell
pnpm add tldts zod
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: 所有依赖写入 `package.json`，安装退出码为 0。

- [ ] **Step 3: 配置脚本与 Vitest**

将以下脚本加入 `package.json`：

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "compile": "wxt prepare && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

创建 `vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
```

创建 `tests/setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: 配置 Manifest 权限**

创建 `wxt.config.ts`：

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SwitchAccounts",
    description: "Save and switch local website login states.",
    permissions: ["cookies", "storage", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    incognito: "not_allowed",
    options_ui: { page: "options.html", open_in_tab: true },
  },
});
```

- [ ] **Step 5: 验证工程基线**

Run:

```powershell
pnpm compile
pnpm test
pnpm build
```

Expected: 三条命令退出码均为 0。

- [ ] **Step 6: 提交**

```powershell
git add package.json pnpm-lock.yaml wxt.config.ts tsconfig.json vitest.config.ts tests/setup.ts .gitignore entrypoints
git commit -m "build: scaffold WXT React extension"
```

## Task 2：定义领域模型、运行时校验与安全错误

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/domain/schemas.ts`
- Create: `src/ui/errors.ts`
- Test: `tests/unit/schemas.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { ExportBundleSchema } from "../../src/domain/schemas";

describe("ExportBundleSchema", () => {
  it("拒绝未知格式版本", () => {
    const result = ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      profiles: [],
    });
    expect(result.success).toBe(false);
  });

  it("拒绝 SameSite=None 且 Secure=false 的 Cookie", () => {
    const result = ExportBundleSchema.safeParse({
      format: "switchaccounts",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profiles: [{
        id: crypto.randomUUID(),
        name: "A",
        normalizedName: "a",
        note: "",
        registrableDomain: "example.com",
        cookies: [{
          name: "sid", value: "secret", domain: ".example.com",
          hostOnly: false, path: "/", secure: false, httpOnly: true,
          sameSite: "no_restriction", session: true, storeId: "0"
        }],
        webStorageByOrigin: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/schemas.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现模型和 Zod Schema**

在 `models.ts` 定义设计文档第 7、8 节的全部接口，并增加：

```ts
export const SCHEMA_VERSION = 1 as const;

export type OperationName =
  | "createProfile" | "overwriteProfile" | "switchProfile"
  | "deleteProfile" | "resetSite" | "updateProfile"
  | "importProfiles" | "exportProfiles";

export type WebStorageCommand =
  | { type: "readWebStorage" }
  | { type: "clearWebStorage" }
  | { type: "writeWebStorage"; snapshot: WebStorageSnapshot };
```

在 `schemas.ts` 用严格对象 Schema 校验所有导入字段；使用 `.superRefine()` 校验：

```ts
if (cookie.sameSite === "no_restriction" && !cookie.secure) {
  ctx.addIssue({ code: "custom", message: "SameSite=None requires Secure" });
}
if (!cookie.path.startsWith("/")) {
  ctx.addIssue({ code: "custom", message: "Cookie path must start with /" });
}
```

导入时还须重新计算并比较 `normalizedName`，拒绝 Cookie domain 超出 `registrableDomain`、Web Storage key 与内部 `origin` 不一致的数据。

- [ ] **Step 4: 实现脱敏错误文案**

`src/ui/errors.ts` 只允许展示 `code`、`message`、阶段、Cookie 名称/域名，不序列化请求、Cookie value 或 Web Storage value：

```ts
export function toSafeErrorText(error: OperationError): string {
  return `${error.message}${formatSafeDetails(error.details)}`;
}
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/unit/schemas.test.ts && pnpm compile`

Expected: PASS。

```powershell
git add src/domain/models.ts src/domain/schemas.ts src/ui/errors.ts tests/unit/schemas.test.ts
git commit -m "feat: define validated domain model"
```

## Task 3：实现站点范围与运行时权限

**Files:**
- Create: `src/domain/site-scope.ts`
- Create: `src/infrastructure/chrome-adapter.ts`
- Test: `tests/unit/site-scope.test.ts`

- [ ] **Step 1: 写 URL 边界失败测试**

```ts
it.each([
  ["https://app.example.co.uk:8443/a", "example.co.uk", "https://app.example.co.uk:8443"],
  ["https://foo.github.io/a", "foo.github.io", "https://foo.github.io"],
])("解析 %s", (url, domain, origin) => {
  expect(resolveSiteScope(url)).toMatchObject({ registrableDomain: domain, currentOrigin: origin });
});

it.each(["chrome://settings", "https://chromewebstore.google.com/detail/x", "file:///tmp/a"])(
  "拒绝特殊页面 %s",
  (url) => expect(resolveSiteScope(url)).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PAGE" } }),
);
```

同时覆盖 localhost、IPv4、IPv6、端口、无注册域 hostname。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/site-scope.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现站点解析**

核心实现：

```ts
const parsed = new URL(rawUrl);
const hostname = parsed.hostname;
const registrableDomain = getDomain(hostname, {
  allowPrivateDomains: true,
  extractHostname: false,
});
```

对 localhost/IP 使用 hostname 本身作为站点键；仅允许 `http:`、`https:`。输出四个权限 origin：

```ts
[
  `http://${domain}/*`,
  `http://*.${domain}/*`,
  `https://${domain}/*`,
  `https://*.${domain}/*`,
]
```

- [ ] **Step 4: 实现 Chrome 适配器**

`chrome-adapter.ts` 暴露可注入接口：

```ts
export interface ChromeAdapter {
  getTab(tabId: number): Promise<chrome.tabs.Tab>;
  containsOrigins(origins: string[]): Promise<boolean>;
  requestOrigins(origins: string[]): Promise<boolean>;
  getCookies(domain: string): Promise<chrome.cookies.Cookie[]>;
  removeCookie(details: chrome.cookies.CookieDetails): Promise<void>;
  setCookie(details: chrome.cookies.SetDetails): Promise<chrome.cookies.Cookie>;
  reloadTab(tabId: number): Promise<void>;
  sendTabMessage<T>(tabId: number, message: WebStorageCommand): Promise<T>;
}
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/unit/site-scope.test.ts && pnpm compile`

```powershell
git add src/domain/site-scope.ts src/infrastructure/chrome-adapter.ts tests/unit/site-scope.test.ts
git commit -m "feat: resolve site scopes and permissions"
```

## Task 4：实现 Cookie 与 Web Storage 快照工具

**Files:**
- Create: `src/domain/cookies.ts`
- Create: `src/domain/profiles.ts`
- Create: `entrypoints/content.ts`
- Test: `tests/unit/cookies.test.ts`
- Test: `tests/unit/profiles.test.ts`

- [ ] **Step 1: 写 Cookie 转换失败测试**

测试 host-only URL 生成、domain Cookie、session Cookie 不带 expirationDate、持久 Cookie 带 expirationDate、partitionKey 条件传递，以及 Cookie URL 使用 `secure ? "https:" : "http:"`。

```ts
expect(toSetDetails(hostOnlyCookie)).toMatchObject({
  url: "https://app.example.com/",
  name: "sid",
  value: "secret",
  path: "/",
});
expect(toSetDetails(hostOnlyCookie)).not.toHaveProperty("domain");
```

- [ ] **Step 2: 写名称与空快照失败测试**

```ts
expect(normalizeProfileName("  Work  ")).toBe("work");
expect(isEmptySnapshot([], { origin, localStorage: {}, sessionStorage: {} })).toBe(true);
expect(searchProfiles(profiles, "secret-cookie-value")).toEqual([]);
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/cookies.test.ts tests/unit/profiles.test.ts`

Expected: FAIL。

- [ ] **Step 4: 实现纯函数**

`cookies.ts` 实现 `fromChromeCookie`、`toSetDetails`、`cookieRemovalUrl`、`validateCookieDomain`。`profiles.ts` 实现名称规范化、唯一性、空快照检测和只匹配名称/备注的搜索。

- [ ] **Step 5: 实现 Content Script**

```ts
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    browser.runtime.onMessage.addListener((message: WebStorageCommand) => {
      if (message.type === "readWebStorage") return snapshotStorage(location.origin);
      if (message.type === "clearWebStorage") {
        localStorage.clear();
        sessionStorage.clear();
        return { ok: true };
      }
      if (message.snapshot.origin !== location.origin) throw new Error("Origin mismatch");
      restoreStorage(message.snapshot);
      return { ok: true };
    });
  },
});
```

写入前先 clear；逐项 `setItem`，异常直接上抛。

- [ ] **Step 6: 验证并提交**

Run: `pnpm vitest run tests/unit/cookies.test.ts tests/unit/profiles.test.ts && pnpm compile`

```powershell
git add src/domain/cookies.ts src/domain/profiles.ts entrypoints/content.ts tests/unit
git commit -m "feat: capture browser storage snapshots"
```

## Task 5：实现本地账号仓库和站点写锁

**Files:**
- Create: `src/infrastructure/profile-repository.ts`
- Create: `src/infrastructure/site-lock.ts`
- Test: `tests/unit/profile-repository.test.ts`
- Test: `tests/unit/site-lock.test.ts`

- [ ] **Step 1: 写仓库原子性失败测试**

覆盖空仓库初始化、按站点/ID查询、同站点名称不区分大小写唯一、更新保留旧数据直到 `chrome.storage.local.set` 成功、导入写入失败不更新内存镜像。

- [ ] **Step 2: 写锁失败测试**

```ts
const first = lock.run("example.com", () => deferred.promise);
await expect(lock.run("example.com", async () => undefined))
  .rejects.toMatchObject({ code: "OPERATION_IN_PROGRESS" });
await expect(lock.run("other.com", async () => "ok")).resolves.toBe("ok");
deferred.resolve();
await first;
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/profile-repository.test.ts tests/unit/site-lock.test.ts`

- [ ] **Step 4: 实现仓库**

仅保存一个键：

```ts
const STORAGE_KEY = "profileRepository";
const EMPTY_REPOSITORY: ProfileRepository = { schemaVersion: 1, profiles: [] };
```

所有变更先构造新对象、通过 Schema 校验，再调用 `storage.local.set`；成功后才返回。不要先删除旧值再写。

- [ ] **Step 5: 实现站点锁**

使用 `Set<string>` 加 `try/finally`：

```ts
async run<T>(domain: string, operation: () => Promise<T>): Promise<T> {
  if (this.active.has(domain)) throw operationError("OPERATION_IN_PROGRESS");
  this.active.add(domain);
  try { return await operation(); }
  finally { this.active.delete(domain); }
}
```

- [ ] **Step 6: 验证并提交**

Run: `pnpm vitest run tests/unit/profile-repository.test.ts tests/unit/site-lock.test.ts`

```powershell
git add src/infrastructure/profile-repository.ts src/infrastructure/site-lock.ts tests/unit
git commit -m "feat: persist profiles atomically"
```

## Task 6：实现新增、覆盖与删除流程

**Files:**
- Create: `src/background/operations.ts`
- Create: `src/infrastructure/web-storage-client.ts`
- Test: `tests/background/profile-operations.test.ts`

- [ ] **Step 1: 写流程失败测试**

覆盖：

- 未授权时返回 `PERMISSION_REQUIRED` 且不读 Cookie/Web Storage。
- 用户拒绝权限后返回 `PERMISSION_DENIED`。
- 三类数据全空时返回 `EMPTY_SNAPSHOT`。
- 覆盖站点不匹配返回 `SITE_MISMATCH`。
- 覆盖持久化失败时原配置仍可读。
- 删除不调用 Cookie 清理、Web Storage 清理或刷新。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/background/profile-operations.test.ts`

- [ ] **Step 3: 实现快照捕获与操作**

`BackgroundOperations` 通过构造函数注入 adapter、repository、lock、clock、UUID：

```ts
constructor(private readonly deps: {
  chrome: ChromeAdapter;
  repository: ProfileRepositoryStore;
  lock: SiteOperationLock;
  now: () => string;
  uuid: () => string;
}) {}
```

`createProfile` 和 `overwriteProfile` 必须在锁内依次完成权限检查、Cookie 读取、Web Storage 读取、规范化、空快照保护和一次持久化。覆盖保留 `id/name/note/createdAt`。

- [ ] **Step 4: 验证并提交**

Run: `pnpm vitest run tests/background/profile-operations.test.ts && pnpm compile`

```powershell
git add src/background/operations.ts src/infrastructure/web-storage-client.ts tests/background
git commit -m "feat: create overwrite and delete profiles"
```

## Task 7：实现切换和重置的失败清理语义

**Files:**
- Modify: `src/background/operations.ts`
- Test: `tests/background/switch-reset.test.ts`

- [ ] **Step 1: 写严格顺序失败测试**

成功顺序必须为：

```text
clear cookies -> clear web storage -> set each cookie -> write web storage -> reload
```

Cookie 写入失败和 Web Storage 写入失败均必须断言第二轮：

```text
clear cookies -> clear web storage
```

且不调用 reload。

- [ ] **Step 2: 写 Cookie 清理范围测试**

模拟主域、子域、host-only、partitioned Cookie，断言每个 Cookie 使用由 secure/domain/path 生成的精确移除 URL，并传递 storeId/partitionKey。

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run tests/background/switch-reset.test.ts`

- [ ] **Step 4: 实现清理和恢复**

提取私有方法：

```ts
private async clearSiteState(tabId: number, scope: SiteScope): Promise<void>
private async restoreProfile(tabId: number, scope: SiteScope, profile: AccountProfile): Promise<void>
private async cleanupAfterFailure(tabId: number, scope: SiteScope): Promise<void>
```

切换捕获错误后停止剩余写入，执行二次清理；若二次清理也失败，将原失败阶段与清理失败项放入不含敏感值的 `details`。

- [ ] **Step 5: 实现重置**

重置只调用 `clearSiteState`，成功后刷新；任何失败都不改仓库且不刷新。

- [ ] **Step 6: 验证并提交**

Run: `pnpm vitest run tests/background/switch-reset.test.ts && pnpm test`

```powershell
git add src/background/operations.ts tests/background/switch-reset.test.ts
git commit -m "feat: switch profiles with clean failure rollback"
```

## Task 8：实现导入、导出与编辑校验

**Files:**
- Create: `src/domain/import-export.ts`
- Modify: `src/background/operations.ts`
- Test: `tests/unit/import-export.test.ts`

- [ ] **Step 1: 写导入导出失败测试**

覆盖全部/站点/账号导出；非法 JSON、未知版本、字段非法、重复导入名称；冲突覆盖且非冲突新增；任一非法配置导致整批拒绝；导入不刷新网页。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/unit/import-export.test.ts`

- [ ] **Step 3: 实现纯函数**

```ts
export function selectProfiles(repository: ProfileRepository, scope: ExportScope): AccountProfile[]
export function buildExportBundle(profiles: AccountProfile[], now: string): ExportBundle
export function previewImport(current: ProfileRepository, bundle: unknown): ImportPreview
export function mergeImport(current: ProfileRepository, bundle: ExportBundle): ProfileRepository
```

冲突键固定为：

```ts
`${profile.registrableDomain}\0${normalizeProfileName(profile.name)}`
```

- [ ] **Step 4: 接入后台**

后台重新校验 `updateProfile`、`importProfiles` 和 `exportProfiles` 的完整负载；编辑 Cookie 时校验 domain、path、SameSite/Secure、expirationDate，编辑 Web Storage 时禁止更改 origin。

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/unit/import-export.test.ts && pnpm test`

```powershell
git add src/domain/import-export.ts src/background/operations.ts tests/unit/import-export.test.ts
git commit -m "feat: validate profile import and export"
```

## Task 9：实现后台消息路由

**Files:**
- Create: `src/background/message-router.ts`
- Create: `src/ui/client.ts`
- Create: `entrypoints/background.ts`
- Test: `tests/background/message-router.test.ts`

- [ ] **Step 1: 写不可信消息失败测试**

断言缺少 tabId、伪造 profile、未知 type、错误 scope 均返回结构化错误而不是抛到 runtime；断言路由不会把敏感请求对象写日志。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/background/message-router.test.ts`

- [ ] **Step 3: 实现 Schema 驱动路由**

```ts
browser.runtime.onMessage.addListener(async (raw) => {
  const parsed = BackgroundRequestSchema.safeParse(raw);
  if (!parsed.success) return invalidRequestResult(parsed.error);
  return router.handle(parsed.data);
});
```

`getCurrentSite` 根据 tabId 重新读取 URL；所有涉及 profileId 的操作由后台查仓库，不信任 UI 传入对象。

- [ ] **Step 4: 实现 UI 客户端**

```ts
export async function sendBackground<T>(
  request: BackgroundRequest,
): Promise<OperationResult<T>> {
  return browser.runtime.sendMessage(request);
}
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/background/message-router.test.ts && pnpm compile`

```powershell
git add src/background/message-router.ts src/ui/client.ts entrypoints/background.ts tests/background
git commit -m "feat: route validated background messages"
```

## Task 10：实现 Popup 高频操作界面

**Files:**
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.tsx`
- Create: `entrypoints/popup/App.tsx`
- Create: `entrypoints/popup/style.css`
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/ErrorNotice.tsx`
- Test: `tests/ui/popup.test.tsx`

- [ ] **Step 1: 写 UI 失败测试**

覆盖无账号、有账号、名称/备注搜索、未授权、特殊页面、进行中禁用、新增表单，以及切换/覆盖/删除/重置确认。测试错误详情不会渲染模拟 secret。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/ui/popup.test.tsx`

- [ ] **Step 3: 实现 Popup**

状态机只保留：

```ts
type PopupStatus = "loading" | "unsupported" | "permission-required" | "ready" | "submitting";
```

所有危险操作通过 `ConfirmDialog`；切换为主按钮，覆盖为次按钮，删除/重置为危险按钮。未授权时仅在用户点击“授权当前网站”后调用权限请求。

- [ ] **Step 4: 增加可访问性与固定尺寸**

所有按钮有可见文本或 `aria-label`，对话框使用 `role="dialog"`，错误使用 `role="alert"`，键盘可完成搜索、表单和确认。Popup 宽度固定 380px，列表超长时内部滚动。

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/ui/popup.test.tsx && pnpm compile`

```powershell
git add entrypoints/popup src/components tests/ui/popup.test.tsx
git commit -m "feat: add popup account actions"
```

## Task 11：实现 Options 管理页

**Files:**
- Create: `entrypoints/options/index.html`
- Create: `entrypoints/options/main.tsx`
- Create: `entrypoints/options/App.tsx`
- Create: `entrypoints/options/style.css`
- Create: `src/components/ProfileEditor.tsx`
- Create: `src/components/CookieEditor.tsx`
- Create: `src/components/WebStorageEditor.tsx`
- Create: `src/components/ImportExportPanel.tsx`
- Create: `src/components/SettingsPanel.tsx`
- Test: `tests/ui/options.test.tsx`

- [ ] **Step 1: 写管理页失败测试**

覆盖按网站/账号/备注搜索、重命名唯一性、备注修改、Cookie 名称/域名/路径搜索、Cookie 校验、Web Storage 编辑不跨 origin、导入摘要、冲突数量和明文导出警告。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/ui/options.test.tsx`

- [ ] **Step 3: 实现四区管理页**

使用单页侧栏导航：账号配置、Cookie 编辑器、导入/导出、设置。Cookie 普通搜索只拼接 `name/domain/path`；任何过滤函数都不得读取 `value`。设置页显示 schema/version 与已授权 origin，并允许调用 `chrome.permissions.remove` 撤销选定站点权限。

- [ ] **Step 4: 实现文件导入导出**

导出前显示固定警告，确认后：

```ts
const blob = new Blob([JSON.stringify(bundle, null, 2)], {
  type: "application/json;charset=utf-8",
});
```

导入先读取文本，用共享的 `ExportBundleSchema` 与 `previewImport` 在管理页生成只读预览，显示新增数、覆盖数、网站列表；二次确认后调用 `importProfiles`，后台再次完整校验并一次写入。

- [ ] **Step 5: 验证并提交**

Run: `pnpm vitest run tests/ui/options.test.tsx && pnpm test && pnpm compile`

```powershell
git add entrypoints/options src/components tests/ui/options.test.tsx
git commit -m "feat: add full profile management page"
```

## Task 12：建立扩展端到端验收

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/switch-accounts.spec.ts`
- Create: `tests/fixtures/site/server.ts`
- Create: `tests/fixtures/site/public/index.html`
- Create: `tests/fixtures/site/public/account.js`

- [ ] **Step 1: 创建双主机测试站点**

本地 HTTPS 测试服务支持 `example.test` 与 `sub.example.test`，提供设置/读取当前账号的接口，写入 host-only、domain、session、persistent、HttpOnly、Secure、SameSite Cookie，以及 localStorage/sessionStorage。

- [ ] **Step 2: 配置持久化 Chromium Context**

```ts
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
```

从 service worker URL 提取 extensionId，并用 `chrome-extension://${extensionId}/popup.html` 和 `options.html` 驱动界面。

- [ ] **Step 3: 写端到端场景**

同一个测试依次验证：

1. 授权站点。
2. 保存账号 A。
3. 改为账号 B 并保存。
4. A/B 往返切换并确认自动刷新。
5. 主域与子域 Cookie 正确恢复。
6. 当前 origin Web Storage 正确恢复，另一 origin 不被虚假宣称恢复。
7. 重置后网站状态为空但配置仍存在。
8. 注入一次 Cookie/Web Storage 故障后无混合状态且不刷新。
9. 导出、清空 `chrome.storage.local`、导入后配置恢复。

- [ ] **Step 4: 运行端到端测试**

Run:

```powershell
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: 所有验收场景 PASS。

- [ ] **Step 5: 提交**

```powershell
git add playwright.config.ts tests/e2e tests/fixtures
git commit -m "test: cover account switching end to end"
```

## Task 13：完成安全审计、文档与发布构建

**Files:**
- Create: `README.md`
- Create: `PRIVACY.md`
- Create: `docs/manual-test-checklist.md`
- Modify: `package.json`

- [ ] **Step 1: 扫描敏感日志和搜索**

Run:

```powershell
rg "console\\.|logger\\.|cookie\\.value|localStorage\\[|sessionStorage\\[" src entrypoints
```

Expected: 除明确的存储读写实现外，不存在凭证值日志、错误拼接或搜索索引。

- [ ] **Step 2: 编写用户与隐私文档**

README 说明安装、开发、构建、权限原因、Cookie 范围、Web Storage 仅当前 origin、失败后清理语义和首版限制。PRIVACY 明确所有数据仅存本机、不遥测、不上传、导出为明文。

- [ ] **Step 3: 编写人工验收清单**

`docs/manual-test-checklist.md` 必须逐项覆盖设计文档第 13 节十条验收标准，以及 Chrome 特殊页面、拒绝权限、撤销权限、重启浏览器后配置仍存在。

- [ ] **Step 4: 执行完整验证**

Run:

```powershell
pnpm test
pnpm compile
pnpm build
pnpm test:e2e
```

Expected: 全部退出码为 0，产物位于 `.output/chrome-mv3`。

- [ ] **Step 5: 检查最终 Manifest**

Run:

```powershell
Get-Content -Raw .output/chrome-mv3/manifest.json
```

Expected: Manifest V3；固定权限只有 cookies/storage/scripting/activeTab；主机权限位于 optional_host_permissions；没有 tabs、<all_urls>、sync 或隐身支持。

- [ ] **Step 6: 提交**

```powershell
git add README.md PRIVACY.md docs/manual-test-checklist.md package.json
git commit -m "docs: document security and release checks"
```

## 规格覆盖自审

- Popup、Options、Background、Content Script：Tasks 4、9、10、11。
- 权限与特殊页面：Tasks 3、6、10。
- 新增、覆盖、删除：Task 6。
- 切换、失败后二次清理、重置：Task 7。
- Cookie/Web Storage 编辑：Tasks 8、11。
- 导入导出原子性与警告：Tasks 8、11、12。
- 注册域、私有后缀、localhost/IP：Task 3。
- 注册域写锁：Task 5。
- 敏感值不进入日志与搜索：Tasks 2、4、10、11、13。
- 单元、后台、UI、E2E：Tasks 2-12。
- 十条验收标准与首版排除项：Tasks 12、13。

## 实施约束

- 每个任务严格遵循红—绿—重构：先写测试、确认失败、最小实现、确认通过。
- 不在 UI 中直接组合 Chrome API 完成业务流程。
- 不记录或展示 Cookie value、localStorage value、sessionStorage value。
- 不增加设计文档“首版不包含”的能力。
- 只在切换成功或重置成功后刷新标签页。
- 每个任务独立提交；执行中发现设计歧义时暂停并回到规格确认。
