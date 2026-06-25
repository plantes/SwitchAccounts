# SwitchAccounts 首版产品与技术设计

**状态：** 已确认

**日期：** 2026-06-26

**目标平台：** Google Chrome（Manifest V3）

**目标用户：** 个人及小团队

## 1. 产品概述

SwitchAccounts 是一个 Chrome 扩展，用于保存网站的不同登录状态，并在不执行网站“退出登录”的前提下快速切换账号。

网站退出操作可能使服务端主动撤销现有会话，导致此前保存的 Cookie 失效。因此，SwitchAccounts 通过保存和恢复浏览器端登录数据完成账号切换，并提供“重置当前状态”来清除当前登录状态。

首版管理以下数据：

- 当前注册域及全部子域的 Cookie。
- 当前页面 origin 的 `localStorage`。
- 当前页面 origin 的 `sessionStorage`。

首版不处理 IndexedDB、Cache Storage 或其他浏览器存储。

## 2. 产品原则

1. **不主动退出账号：** 插件不调用网站退出功能，避免服务端撤销已保存会话。
2. **切换结果一致：** 切换前先清除旧状态，再恢复目标账号，避免不同账号数据混合。
3. **失败后保持干净：** 恢复任一关键数据失败时，再次清空目标范围，不保留半切换状态。
4. **操作语义明确：** “删除账号”只删除保存配置；“重置当前状态”只清理网站状态。
5. **数据仅存本机：** 不提供云同步或远程账户系统。
6. **敏感数据透明提示：** Cookie、Web Storage 和导出文件均可能包含可直接使用的登录凭证。

## 3. 首版功能

### 3.1 扩展弹窗

弹窗是高频操作入口，基于当前活动标签页工作。

弹窗顶部显示：

- 当前页面主机名。
- 解析得到的注册域。
- “包含全部子域名”的 Cookie 范围说明。
- 当前站点是否已经授权。

#### 无账号配置状态

当当前注册域没有保存的账号时，显示：

- “暂无账号配置”。
- “保存当前登录状态，之后可一键切换”的说明。
- “新增账号”按钮。
- “重置当前状态”按钮。

即使没有保存账号，也允许重置当前网站状态。

#### 有账号配置状态

当当前注册域存在账号时，显示：

- 账号名称搜索框。
- “新增账号”按钮。
- “重置当前状态”按钮。
- 当前站点的账号配置列表。

每个账号固定提供以下操作：

- **切换：** 清理当前状态并恢复该账号。
- **覆盖：** 使用当前网站状态替换该账号的保存快照。
- **删除：** 删除该账号配置，不修改当前网站。

“切换”是主要操作；“覆盖”是次要操作；“删除”和“重置当前状态”使用危险操作样式。

### 3.2 管理页

管理页包含四个功能区域：

1. **账号配置**
   - 按网站查看账号。
   - 新建、重命名、修改备注和删除账号。
   - 查看 Cookie、localStorage、sessionStorage 项目数量。
2. **Cookie 编辑器**
   - 仅编辑已保存账号快照，不直接修改当前网站 Cookie。
   - 支持按名称、域名和路径进行模糊搜索与自动补全。
3. **导入 / 导出**
   - 导出全部配置、指定网站或指定账号。
   - 从 JSON 文件导入配置。
4. **设置**
   - 展示本地明文存储警告。
   - 管理已授权网站。
   - 展示版本和数据格式版本。

### 3.3 搜索

- 弹窗按账号名称和备注搜索。
- 管理页按网站、账号名称和备注搜索。
- Cookie 编辑器按 Cookie 名称、域名和路径搜索。
- 普通搜索不匹配 Cookie 值，避免敏感凭证意外出现在结果或搜索建议中。

## 4. 核心操作流程

### 4.1 首次授权

1. 用户在受支持的网页打开弹窗。
2. 插件解析当前注册域和 origin。
3. 若尚未获得站点权限，用户点击需要访问数据的操作时申请：
   - 当前注册域的 HTTP 权限。
   - 当前注册域全部子域的 HTTP 权限。
   - 当前注册域的 HTTPS 权限。
   - 当前注册域全部子域的 HTTPS 权限。
4. 用户拒绝后不读取任何站点数据，并显示重新授权入口。

插件不在安装时默认申请所有网站权限。

### 4.2 新增账号

1. 用户点击“新增账号”。
2. 输入必填名称和可选备注。
3. 插件读取注册域及子域 Cookie。
4. 插件读取当前 origin 的 localStorage 和 sessionStorage。
5. 插件规范化并校验快照。
6. 若三类存储均为空，拒绝保存并提示当前站点没有可保存的状态。
7. 保存账号配置。

新增成功后不清理或刷新当前网页。

同一注册域内账号名称不区分大小写且必须唯一。名称首尾空白在比较前移除。

### 4.3 覆盖账号

“覆盖”表示使用当前网站状态更新指定账号的快照，不表示切换账号。

1. 用户点击账号行的“覆盖”。
2. 确认框展示目标账号、站点、旧快照统计和当前快照统计。
3. 用户确认原快照将被替换。
4. 插件重新读取注册域及子域 Cookie，以及当前 origin 的 Web Storage。
5. 若当前快照完全为空，拒绝覆盖。
6. 插件在内存中完成规范化和可恢复性校验。
7. 校验成功后原子替换保存快照。

覆盖时：

- 目标配置注册域必须与当前页面注册域一致。
- 保留账号 ID、名称、备注和创建时间。
- 更新 Cookie、Web Storage 和修改时间。
- 不清理、不刷新、不切换当前网页。
- 持久化失败时保留旧快照。

### 4.4 切换账号

1. 用户点击“切换”。
2. 插件显示确认提示。
3. 用户确认后禁用相关操作，防止重复切换。
4. 清除注册域及全部子域 Cookie。
5. 清除当前 origin 的 localStorage 和 sessionStorage。
6. 逐项恢复目标账号 Cookie。
7. 恢复目标账号在当前 origin 下的 localStorage 和 sessionStorage。
8. 全部成功后刷新当前标签页。

目标账号中若不存在当前 origin 的 Web Storage 快照，切换时保持该 origin 的 Web Storage 为空。

#### 切换失败

Cookie 或 Web Storage 任一步骤失败时：

1. 立即停止剩余恢复步骤。
2. 再次清除注册域及子域 Cookie。
3. 再次清除当前 origin 的 Web Storage。
4. 不以成功状态刷新页面。
5. 显示失败阶段、失败项目和可重试操作。

失败处理不自动恢复切换前账号。

### 4.5 重置当前状态

1. 用户点击“重置当前状态”。
2. 确认框明确提示将清除 Cookie 与 Web Storage，但不会删除已保存账号。
3. 清除注册域及全部子域 Cookie。
4. 清除当前 origin 的 localStorage 和 sessionStorage。
5. 成功后刷新当前标签页。

重置失败时显示具体失败项，不删除任何保存配置。

### 4.6 删除账号

1. 用户点击“删除”。
2. 确认框展示账号名称和站点。
3. 用户确认后删除保存配置。

删除不会清理或刷新当前网站。

### 4.7 Cookie 快照编辑

用户在管理页选择网站和账号后编辑 Cookie 快照。

可编辑字段：

- `name`
- `value`
- `domain`
- `path`
- `secure`
- `httpOnly`
- `sameSite`
- `expirationDate`

保存前必须校验：

- Cookie 名称非空。
- domain 属于账号配置的注册域范围。
- path 以 `/` 开始。
- `SameSite=None` 时必须启用 `Secure`。
- expirationDate 是有效的 Unix 秒时间戳。
- 不允许将 Cookie 移动到配置注册域之外。

首版允许查看、搜索、编辑和删除保存快照中的 localStorage、sessionStorage 条目，但不允许跨 origin 移动条目。

### 4.8 导出

导出范围：

- 全部账号配置。
- 单个网站的全部账号。
- 单个账号。

导出前必须显示固定警告：

> 导出文件包含可直接使用的登录凭证。请勿上传、分享或保存在不可信位置。

导出文件为 UTF-8 编码的明文 JSON，包含格式版本和导出时间。

### 4.9 导入

1. 用户选择 JSON 文件。
2. 插件解析并完整校验文件。
3. 管理页显示新增数量、覆盖数量和涉及网站。
4. 用户确认后一次性写入。

冲突规则：

- 同一注册域、同名账号视为冲突。
- 冲突配置全部由导入内容覆盖。
- 账号名称比较不区分大小写。
- 非冲突配置新增。

原子性规则：

- 文件中任一配置或字段非法时，整批拒绝。
- 持久化失败时保留导入前数据。
- 导入成功不修改当前网页，也不自动刷新。

## 5. 技术架构

### 5.1 技术栈

- WXT
- React
- TypeScript
- Chrome Manifest V3
- Vitest
- React Testing Library
- Playwright，用于本地测试站点的浏览器端验收
- `tldts`，使用 Public Suffix List 解析注册域，并启用私有后缀规则

URL 必须先由浏览器原生 `URL` 解析器提取并规范化 hostname，再调用：

```ts
getDomain(hostname, {
  allowPrivateDomains: true,
  extractHostname: false,
});
```

这样由浏览器负责 URL 边界和 IDNA 规范化，`tldts` 只负责公共后缀与注册域拆分。

### 5.2 扩展入口

- **Popup：** 当前站点账号的快速操作界面。
- **Options Page：** 完整管理页。
- **Background Service Worker：** 权限、Cookie、配置存储、导入导出和操作编排。
- **Content Script：** 当前 origin Web Storage 的读取、清理和恢复。

界面组件不得直接组合多个 Chrome API 调用完成业务操作。所有业务流程通过后台消息调用，由后台统一返回结构化结果。

### 5.3 数据流

```text
Popup / Options Page
        |
        | typed messages
        v
Background Service Worker
   |        |         |
   |        |         +--> chrome.storage.local
   |        +------------> chrome.cookies
   +---------------------> Content Script --> Web Storage
```

后台服务负责：

- 校验调用上下文。
- 解析站点范围。
- 检查和请求权限。
- 串行化同一站点的写操作。
- 捕获和恢复 Cookie。
- 请求内容脚本操作 Web Storage。
- 原子更新账号仓库。
- 生成统一错误信息。

同一注册域在任一时刻只允许执行一个新增、覆盖、切换、重置、删除或导入写操作。

## 6. 数据边界

### 6.1 Cookie 范围

Cookie 快照覆盖当前注册域及其全部子域。恢复时保留 Chrome Cookies API 支持的可恢复属性，包括：

- `name`
- `value`
- `domain`
- `hostOnly`
- `path`
- `secure`
- `httpOnly`
- `sameSite`
- `session`
- `expirationDate`
- `storeId`
- `partitionKey`（Chrome 版本支持时）

`hostOnly` 和 `session` 是快照语义字段，恢复参数根据其含义转换，不直接作为 `chrome.cookies.set` 参数传递。

### 6.2 Web Storage 范围

localStorage 和 sessionStorage 按 origin 隔离。首版只读取操作发起标签页的：

```text
scheme://host:port
```

插件不会尝试枚举未知子域的 Web Storage，也不会因为 Cookie 范围覆盖子域而宣称同时覆盖所有子域 Web Storage。

### 6.3 特殊页面

以下页面不提供账号操作：

- `chrome://` 页面。
- Chrome Web Store。
- 其他扩展页面。
- 浏览器内部页面。
- 未获授权的 `file://` 页面。
- 无法注入内容脚本的页面。

弹窗必须显示具体不可用原因，并隐藏必然失败的操作。

首版不支持隐身窗口。

## 7. 数据模型

```ts
export const SCHEMA_VERSION = 1 as const;

export interface SiteScope {
  registrableDomain: string;
  currentOrigin: string;
  hostname: string;
  permissionOrigins: string[];
}

export interface CookiePartitionKeySnapshot {
  topLevelSite?: string;
  hasCrossSiteAncestor?: boolean;
}

export interface CookieSnapshot {
  name: string;
  value: string;
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: chrome.cookies.SameSiteStatus;
  session: boolean;
  expirationDate?: number;
  storeId: string;
  partitionKey?: CookiePartitionKeySnapshot;
}

export interface WebStorageSnapshot {
  origin: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface AccountProfile {
  id: string;
  name: string;
  normalizedName: string;
  note: string;
  registrableDomain: string;
  cookies: CookieSnapshot[];
  webStorageByOrigin: Record<string, WebStorageSnapshot>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRepository {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: AccountProfile[];
}

export interface ExportBundle {
  format: "switchaccounts";
  schemaVersion: typeof SCHEMA_VERSION;
  exportedAt: string;
  profiles: AccountProfile[];
}
```

时间字段使用 ISO 8601 UTC 字符串。账号 ID 使用 UUID。`normalizedName` 由去除首尾空白并转为小写后的名称生成。

## 8. 后台消息接口

```ts
export type BackgroundRequest =
  | { type: "getCurrentSite"; tabId: number }
  | { type: "listProfiles"; registrableDomain: string }
  | { type: "createProfile"; tabId: number; name: string; note?: string }
  | { type: "overwriteProfile"; tabId: number; profileId: string }
  | { type: "switchProfile"; tabId: number; profileId: string }
  | { type: "deleteProfile"; profileId: string }
  | { type: "resetSite"; tabId: number }
  | { type: "updateProfile"; profile: AccountProfile }
  | { type: "importProfiles"; bundle: ExportBundle }
  | {
      type: "exportProfiles";
      scope:
        | { type: "all" }
        | { type: "site"; registrableDomain: string }
        | { type: "profile"; profileId: string };
    };

export interface OperationError {
  code:
    | "UNSUPPORTED_PAGE"
    | "PERMISSION_REQUIRED"
    | "PERMISSION_DENIED"
    | "EMPTY_SNAPSHOT"
    | "PROFILE_NOT_FOUND"
    | "DUPLICATE_PROFILE_NAME"
    | "SITE_MISMATCH"
    | "COOKIE_READ_FAILED"
    | "COOKIE_CLEAR_FAILED"
    | "COOKIE_WRITE_FAILED"
    | "WEB_STORAGE_READ_FAILED"
    | "WEB_STORAGE_CLEAR_FAILED"
    | "WEB_STORAGE_WRITE_FAILED"
    | "IMPORT_INVALID"
    | "STORAGE_WRITE_FAILED"
    | "OPERATION_IN_PROGRESS";
  message: string;
  details?: unknown;
}

export type OperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: OperationError };
```

消息负载必须在后台重新校验，不能信任界面或导入文件传入的对象。

## 9. 权限设计

Manifest 固定权限仅包含实际需要的扩展能力：

- `cookies`
- `storage`
- `scripting`
- `activeTab`

首版不声明 `tabs` 权限。弹窗由用户点击扩展图标触发，通过 `activeTab` 获得当前标签页的临时访问能力；获得对应站点的可选主机权限后，后台可继续读取 URL、执行脚本和刷新该标签页。

网站权限通过 `optional_host_permissions` 和运行时 `chrome.permissions.request` 获取。

对 `example.com` 的权限请求范围为：

```text
http://example.com/*
http://*.example.com/*
https://example.com/*
https://*.example.com/*
```

权限申请必须由明确的用户手势触发。

## 10. 本地存储与安全

- 配置存储在 `chrome.storage.local`。
- 不使用 `chrome.storage.sync`。
- 不加密账号配置。
- 不上传账号数据、域名、Cookie 或 Web Storage。
- 导出文件保持明文可读。
- 管理页和导出流程必须持续提示数据敏感性。
- 日志、错误报告和遥测中不得记录 Cookie 值或 Web Storage 值。
- 首版不实现遥测。

## 11. 错误处理与交互状态

- 所有写操作必须显示进行中状态并禁用重复提交。
- 删除、覆盖、切换和重置必须二次确认。
- 新增操作通过提交表单确认，不额外显示第二个确认框。
- 权限拒绝不视为程序错误，提供解释和重新授权入口。
- 错误详情可展示 Cookie 名称、域名和失败阶段，但不得展示 Cookie 值。
- 页面刷新只发生在切换成功或重置成功后。
- 新增、覆盖、删除、编辑、导入和导出均不刷新页面。

## 12. 测试策略

### 12.1 单元测试

覆盖：

- Public Suffix List 注册域解析。
- localhost、IP 地址、端口和不支持协议处理。
- Cookie 快照序列化及恢复参数转换。
- SameSite 与 Secure 校验。
- Web Storage 序列化。
- 账号名称规范化和同名判断。
- 模糊搜索不匹配 Cookie 值。
- 导出范围筛选。
- 导入结构、版本、字段和冲突覆盖校验。
- 空快照保护。
- 操作错误映射。

### 12.2 后台服务测试

使用 Chrome API 适配层测试：

- 新增账号成功和空快照失败。
- 覆盖成功、站点不匹配和持久化失败时保留旧快照。
- 删除账号不调用网站清理。
- 重置网站不修改账号仓库。
- 切换成功时严格按照清除、Cookie 恢复、Web Storage 恢复、刷新顺序执行。
- Cookie 写入失败后再次清理。
- Web Storage 写入失败后再次清理。
- 权限拒绝时不读取站点数据。
- 同一站点并发写操作被拒绝。

### 12.3 UI 测试

覆盖：

- 弹窗无账号状态。
- 弹窗有账号状态。
- 搜索过滤。
- 新增账号表单。
- 切换、覆盖、删除和重置确认框。
- 操作进行中按钮禁用。
- 错误详情不泄露凭证值。
- 特殊页面不可用状态。
- 管理页 Cookie 与 Web Storage 编辑校验。
- 导入摘要和明文导出警告。

### 12.4 端到端测试

建立本地测试站点，至少包含一个主域页面和一个子域页面，验证：

- 主域 Cookie。
- 子域 Cookie。
- host-only Cookie。
- session Cookie 和持久 Cookie。
- Secure、HttpOnly、SameSite Cookie。
- 当前 origin 的 localStorage 和 sessionStorage。
- 按站点授权。
- 两个账号往返切换。
- 自动刷新。
- 重置后配置仍存在。
- 切换注入失败后无混合状态。
- 导出、清空扩展数据、导入后的配置恢复。

## 13. 验收标准

首版完成必须满足：

1. 用户可为同一网站保存至少两个账号。
2. 用户无需调用网站退出登录即可在两个账号间往返切换。
3. Cookie 覆盖注册域及全部子域。
4. Web Storage 行为明确限制在当前 origin。
5. 切换失败后不存在已知的混合账号状态。
6. 重置当前状态不会删除已保存账号。
7. 覆盖失败不会损坏旧快照。
8. Cookie 编辑只影响保存快照。
9. 明文 JSON 导出后可在清空扩展数据的环境中完整导入。
10. 敏感值不会写入日志或普通搜索结果。

## 14. 首版不包含

- 云同步。
- 主密码或本地加密。
- Chrome 账户同步。
- IndexedDB。
- Cache Storage。
- 自动识别当前账号。
- 自动定时备份。
- 跨设备同步。
- Firefox 或 Safari 支持。
- 隐身窗口支持。
- 网站退出接口集成。

## 15. 设计依据

- [Chrome Cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [WXT Entrypoints](https://wxt.dev/guide/essentials/entrypoints.html)
