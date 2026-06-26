# Changelog

## Unreleased

### Fixed

- 修复首次新增账号时可能因站点权限申请不在 Popup 用户手势内触发而卡住的问题；现在 Popup 会先申请当前站点权限，并在后台消息异常时恢复按钮和显示错误。

## 1.0.0 - 2026-06-26

首个稳定版本。

### 新增

- Chrome Manifest V3 扩展基础框架，基于 WXT、React、TypeScript。
- Popup 快捷操作：保存当前登录状态、切换账号、覆盖快照、删除配置、重置当前站点状态。
- Options 管理页：账号管理、Cookie 快照编辑、Web Storage 快照编辑、导入/导出、站点权限管理。
- Cookie 快照覆盖注册域及全部子域，保留可恢复字段：名称、值、域名、路径、Secure、HttpOnly、SameSite、Session/Expiration、storeId、partitionKey。
- Web Storage 快照限定当前 origin，支持 localStorage/sessionStorage 的查看、编辑、删除和新增条目。
- 导入/导出明文 JSON，导入前显示新增数量、覆盖数量和涉及站点。
- 切换与重置流程：成功后刷新页面；恢复失败后执行二次清理，避免混合账号状态。
- 本地存储：所有配置仅保存到 `chrome.storage.local`，不上传、不云同步。

### 安全与权限

- 固定权限限制为 `cookies`、`storage`、`scripting`、`activeTab`。
- 主机权限通过 `optional_host_permissions` 在运行时申请。
- 不声明 `tabs`、`<all_urls>`、`storage.sync` 或隐身窗口支持。
- 普通搜索不匹配 Cookie 值或 Web Storage 值。
- 错误展示和日志扫描避免泄露凭证值。

### 测试

- 单元、后台和 UI 测试覆盖核心领域模型、仓库、导入导出、消息路由、Popup 和 Options。
- Playwright E2E 覆盖保存 A/B 账号、往返切换、注册域/子域 Cookie、当前 origin Web Storage、重置、导出、清空扩展数据和导入恢复。
- 发布验证命令：
  - `corepack pnpm test`
  - `corepack pnpm compile`
  - `corepack pnpm build`
  - `corepack pnpm test:e2e`
