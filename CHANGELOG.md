# Changelog

## Unreleased

## 1.0.4 - 2026-09-06

### Fixed

- 修复操作期间页面跳转导致清理其他网站存储的问题；读取、清理、恢复与刷新绑定原始页面文档和 origin。
- 修复账号库并发写入与旧界面快照覆盖新数据的问题；统一串行写入、增加版本冲突检测，重命名只更新名称。
- 修复改名后重新导入备份产生重复 ID、切换命中错误账号和删除多条账号的问题；自动修复历史重复 ID 并保留全部记录。
- 修复备用脚本写入 Web Storage 失败仍返回成功并刷新的问题；统一验证操作回执，失败后二次清理且不刷新。
- 修复分区 Cookie 未保存和未清理、无名 Cookie 阻止保存、`__proto__` 存储键丢失的问题。
- 修复 Cookie/Web Storage 编辑丢字符、Cookie 名称/域名/路径修改后丢焦点和管理页吞掉操作错误的问题；编辑使用本地草稿和明确保存，失败保留草稿，离开未保存编辑时提示。
- 修复管理页按网站搜索无效、导入预览显示晚于确认，以及侧边栏 Escape 错误提交重命名的问题。
- JSON 值格式化保留大整数及原始转义，不在每次输入时重新格式化内容。
- 修复 Options 账号页在中等窗口宽度下概览统计和编辑控件被裁切的问题；账号详情按实际可用宽度切换为单列布局。

### Changed

- 最低支持 Chrome 119，以使用文档定向脚本和分区 Cookie API；网站权限仍按站点动态申请。
- 增加针对本轮 13 项审查问题的回归测试，并使用支持扩展的 Chromium 无界面模式运行浏览器测试。

## 1.0.3 - 2026-09-03

### Changed

- 将工具栏弹窗迁移为 Chrome 原生固定侧边栏；点击扩展图标打开侧边栏，并在标签页切换或页面导航后自动跟随当前站点。
- 侧边栏界面改为响应浏览器面板宽度并占满可用高度。
- Options 管理页改为“账号 / 工具”双工作区导航；进入“工具与设置”时隐藏账号列表列，并使用全宽配置管理、拖放导入、可选账号备份与授权管理布局；导出文件名增加本地时间戳。

### Security

- 固定权限由 `activeTab` 调整为 `sidePanel` 与 `tabs`；`tabs` 仅用于侧边栏持续识别当前活动标签页，网站内容权限仍按站点动态申请。

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
