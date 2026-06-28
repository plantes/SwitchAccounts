# Changelog

## 1.0.2 - 2026-06-29

### Fixed

- 切换账号时跳过已过期的持久 Cookie，避免短期状态 Cookie 过期导致整个恢复流程失败。
- Web Storage 消息发送失败时自动使用脚本 fallback 读取、清理或恢复当前页面存储，减少扩展更新后旧页面未注入 content script 的影响。

## 1.0.1 - 2026-06-28

### Added

- 新增双钥匙 Chrome 图标，并配置 `icons` 与 `action.default_icon` 的 `16/32/48/128px` 资源。

### Changed

- Popup 改为深色工作台 UI，优化站点信息、账号保存、账号列表、登出入口和长文本适配。
- Options 管理页统一到 Popup 工作台风格，保留左侧账号栏，并重做账号摘要、Tab、表单、列表和工具区视觉。
- Options 页面可见中文文案恢复为正常简体中文。

### Fixed

- 修复 Popup 根宽度和高度依赖 viewport 时在 Chrome 扩展弹窗中可能塌缩的问题。
- 修复 Popup 当前站点域名行高过紧导致文字下沿被裁切的问题。
- 修复首次新增账号时可能因站点权限申请不在 Popup 用户手势内触发而卡住的问题；现在 Popup 会先申请当前站点权限，并在后台消息异常时恢复按钮和显示错误。

## 1.0.0 - 2026-06-26

首个稳定版本。

### Added

- Chrome Manifest V3 扩展基础框架，基于 WXT、React、TypeScript。
- Popup 快捷操作：保存当前登录状态、切换账号、覆盖快照、删除配置、重置当前站点状态。
- Options 管理页：账号管理、Cookie 快照编辑、Web Storage 快照编辑、导入 / 导出、站点权限管理。
- Cookie 快照覆盖注册域及全部子域，保留可恢复字段：名称、值、域名、路径、Secure、HttpOnly、SameSite、Session/Expiration、storeId、partitionKey。
- Web Storage 快照限定当前 origin，支持 localStorage/sessionStorage 的查看、编辑、删除和新增条目。
- 导入 / 导出明文 JSON，导入前显示新增数量、覆盖数量和涉及站点。
- 切换与重置流程：成功后刷新页面；恢复失败后执行二次清理，避免混合账号状态。
- 本地存储：所有配置仅保存到 `chrome.storage.local`，不上传、不云同步。

### Security

- 固定权限限制为 `cookies`、`storage`、`scripting`、`activeTab`。
- 主机权限通过 `optional_host_permissions` 在运行时申请。
- 不声明 `tabs`、`<all_urls>`、`storage.sync` 或隐身窗口支持。
- 普通搜索不匹配 Cookie 值或 Web Storage 值。
- 错误展示和日志扫描避免泄露凭证值。

### Tests

- 单元、后台和 UI 测试覆盖核心领域模型、仓库、导入导出、消息路由、Popup 和 Options。
- Playwright E2E 覆盖保存 A/B 账号、往返切换、注册域 / 子域 Cookie、当前 origin Web Storage、重置、导出、清空扩展数据和导入恢复。
- 发布验证命令：
  - `corepack pnpm test`
  - `corepack pnpm compile`
  - `corepack pnpm build`
  - `corepack pnpm test:e2e`
