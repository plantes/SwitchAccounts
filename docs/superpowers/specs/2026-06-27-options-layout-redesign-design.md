# SwitchAccounts Options 页布局重构设计

**状态：** 已确认

**日期：** 2026-06-27

**范围：** 仅重构 `entrypoints/options` 管理页的信息架构、布局和交互；不改变后台消息协议、账号数据模型、导入导出格式或 popup 行为。

## 1. 背景

当前 options 页把账号配置、Cookie 编辑器、Web Storage 编辑器、导入导出和设置全部作为独立面板铺在同一网格里。真实数据量较大时，宽屏会出现以下问题：

- 多个重型编辑器同时展开，页面没有清晰主任务。
- Web Storage 条目和删除按钮被挤到相邻面板区域，操作落点混乱。
- 导入导出、设置等低频功能和 Cookie / Storage 高频编辑并排抢宽度。
- 左侧品牌栏占宽但不承担导航任务，宽屏可用空间被浪费。

这次重构采用“左侧账号导航 + 右侧详情标签页”的布局，避免所有编辑器同时展开。

## 2. 设计目标

1. 宽屏下不再出现四列或五列重型面板并排。
2. 一次只展示一个主要编辑任务：概览、Cookie、Web Storage 或工具。
3. 账号选择始终可见，用户可以快速在账号之间切换。
4. 低频工具从主编辑流中移出，避免影响 Cookie / Storage 的可读性。
5. 保持当前管理能力：账号信息编辑、Cookie 编辑、Web Storage 编辑、导入导出、授权站点管理。
6. 保持敏感数据保护规则：普通管理页搜索不匹配 Cookie 值或 Storage 值，Cookie 值默认用 password 输入展示。

## 3. 信息架构

页面拆成两大区域：

- 左侧导航栏：品牌、管理页搜索、账号列表、工具入口。
- 右侧详情区：当前账号摘要、标签页导航、当前标签页内容。

右侧标签页包括：

- `概览`：账号名称、统计信息、保存和删除账号。
- `Cookie`：Cookie 搜索、Cookie 列表和单条 Cookie 编辑。
- `Web Storage`：按 origin 和 storage kind 分组的 Storage 条目编辑。
- `工具`：导入导出、授权站点管理、数据格式版本和敏感数据警告。

默认选择规则：

- 初次加载后选中第一个过滤后的账号。
- 如果用户已经选中过账号，搜索过滤后仍存在该账号时保持选择。
- 如果当前选择被过滤掉或删除，回退到过滤结果中的第一个账号。
- 默认激活 `概览` 标签。
- 切换账号时保留当前标签页；如果没有选中账号，则右侧显示空状态。

## 4. 布局规则

### 4.1 桌面宽屏

当视口宽度足够时，使用双栏布局：

```text
┌───────────────┬────────────────────────────────────────────┐
│ 账号导航       │ 当前账号摘要                               │
│ 搜索           │ 标签页：概览 / Cookie / Storage / 工具       │
│ 账号列表       │ 当前标签内容                               │
│ 工具入口       │                                            │
└───────────────┴────────────────────────────────────────────┘
```

建议宽度：

- 左侧导航栏：280px 到 340px。
- 右侧详情区：`minmax(0, 1fr)`。
- 整页最大内容宽度不强制收窄；编辑器内部通过表单网格和文本截断控制可读性。

### 4.2 中窄屏

当视口宽度不足以维持双栏时：

- 页面改为单列。
- 账号导航在上，详情区在下。
- 标签页允许横向换行或横向滚动，但不能造成整页横向滚动。
- Cookie 和 Storage 行改为单列或两列自适应。

### 4.3 防溢出要求

- 所有主容器使用 `min-width: 0`。
- 长域名、origin、storage key、cookie name 使用 `overflow-wrap: anywhere` 或受控截断。
- 删除按钮必须留在所属行或所属卡片内部，不允许悬浮到相邻面板。
- 表单控件宽度受父容器限制，不能撑开页面。

## 5. 交互设计

### 5.1 搜索与账号选择

左侧搜索继续按网站和账号名称过滤账号，不匹配 Cookie 值或 Web Storage 值。

账号列表项展示：

- registrable domain。
- 账号名称。
- Cookie 数量。
- Origin 数量。

选中项使用明确的边框、背景或左侧强调线。点击账号列表项即可选中，不再需要单独的“编辑”按钮。

### 5.2 概览标签

概览标签负责账号级信息：

- 账号名称输入框。
- Cookie / Origin 统计。
- 保存账号信息按钮。
- 删除账号按钮。

删除账号仍使用确认框，语义保持为只删除保存配置，不修改当前网站。

### 5.3 Cookie 标签

Cookie 标签展示当前账号的 Cookie 快照。

交互要求：

- 顶部保留 Cookie 搜索框，按 Cookie name、domain、path 过滤。
- Cookie 列表只在该标签内出现。
- 每条 Cookie 使用自包含编辑区域，包含 name、value、domain、path、secure、httpOnly、sameSite、session、expiration。
- Cookie 值输入框继续使用 `type="password"`。
- 删除 Cookie 按钮留在该 Cookie 编辑区域底部或右上角，不进入其他面板区域。

校验规则沿用现有逻辑：

- name 非空。
- path 以 `/` 开头。
- `SameSite=None` 必须启用 Secure。
- persistent cookie 必须有有效 expirationDate。

### 5.4 Web Storage 标签

Web Storage 标签展示当前账号的 Web Storage 快照。

交互要求：

- 按 origin 分组。
- 每个 origin 下分 `localStorage` 和 `sessionStorage`。
- 每个条目使用三段式布局：key、value、删除。
- key 允许换行或截断，value 输入框占主要宽度。
- 删除按钮固定在条目行末尾；窄屏时移动到行内底部，不脱离所属条目。
- 新增条目表单位于对应 kind 的条目列表之后。

Storage 条目编辑仍只更新保存快照，不直接修改当前网站。

### 5.5 工具标签

工具标签承载低频功能：

- 明文导出警告。
- 导入 JSON 文件。
- 导出全部配置。
- 已授权网站列表和撤销按钮。
- 数据格式版本。

导入预览保持现有行为：显示新增数量、覆盖数量和涉及站点；用户确认后才导入。

## 6. 组件结构

建议将 `OptionsApp` 拆成更小的 UI 单元，但仍保留在 options 入口内部，避免引入新的跨模块复杂度。

建议组件：

- `OptionsApp`：加载数据、持有全局状态、组织布局。
- `AccountSidebar`：搜索、账号列表、账号选择。
- `AccountSummary`：右侧顶部当前账号摘要。
- `Tabs`：标签导航。
- `OverviewTab`：账号名称、统计和账号级操作。
- `CookieTab`：Cookie 搜索和列表。
- `CookieEditorRow`：单条 Cookie 编辑。
- `WebStorageTab`：origin / kind 分组。
- `StorageRow`：单条 Storage 编辑。
- `ToolsTab`：导入导出、授权站点、版本信息。

后台调用仍通过现有 `send` 函数传入，方便现有 UI 测试继续注入 fake send。

## 7. 状态与数据流

新增或调整的 UI 状态：

- `selectedId`：当前账号。
- `activeTab`：`overview | cookies | storage | tools`。
- `query`：左侧账号搜索。
- `cookieFilter`：Cookie 标签内部搜索。
- `error`：顶层错误提示。

数据流：

1. `OptionsApp` 加载 `listAllProfiles` 和 `listGrantedSites`。
2. 左侧搜索产生 `filteredProfiles`。
3. `selected` 从 `selectedId` 和 `profiles` 派生。
4. 右侧根据 `selected` 和 `activeTab` 渲染对应标签。
5. 子组件执行 `updateProfile`、`importProfiles`、`removeGrantedSite` 后调用 `load` 刷新。

导入成功或删除账号后，如果当前选中账号不再存在，由 `OptionsApp` 选择新的可用账号。

## 8. 空状态与错误处理

空状态：

- 没有任何账号：左侧显示空列表，右侧显示导入入口和说明。
- 搜索无结果：左侧显示“无匹配账号”，右侧保留当前选择或显示空状态。
- 当前账号无 Cookie：Cookie 标签显示空状态和搜索框。
- 当前账号无 Web Storage：Web Storage 标签显示空状态。
- 无授权站点：工具标签中的授权列表显示空状态。

错误处理：

- `listAllProfiles` 失败时显示顶层 alert。
- `listGrantedSites` 失败不阻断账号编辑，但工具标签显示授权站点加载失败。
- 更新、删除、导入失败时在当前标签附近显示安全错误文本。
- 不展示 Cookie 值或 Storage 值在错误消息中。

## 9. 视觉方向

保持当前深色、本地工具感的基调，但降低装饰性卡片密度：

- 主布局更接近工作台，不做营销式 hero。
- 卡片半径使用 8px。
- 左侧导航与右侧详情形成明确层级。
- 主操作使用暖黄色；危险操作使用红橙色。
- 密集编辑区域优先保证行高、对齐和扫描效率。

## 10. 测试策略

### 10.1 UI 单元测试

更新 `tests/ui/options.test.tsx`，覆盖：

- 管理页搜索仍不匹配 Cookie 值。
- 账号列表可以选择不同账号。
- 默认显示概览标签。
- 点击 Cookie 标签后显示 Cookie 编辑器。
- 点击 Web Storage 标签后显示 Storage 编辑器，并可以新增条目。
- 点击工具标签后显示导入导出警告和授权站点。
- Cookie 值不以明文文本出现。

### 10.2 布局验证

使用浏览器渲染 options 页并检查：

- 1920px 宽屏无横向溢出。
- 1280px 宽屏无横向溢出。
- 760px 中窄屏无横向溢出。
- 420px 窄屏无横向溢出。
- Web Storage 删除按钮位于所属行内部。
- Cookie checkbox label 不换行到下一行。

### 10.3 回归验证

运行：

- `tsc --noEmit`
- `vitest run`
- `wxt build`

如本次改动触及 e2e 依赖的 options 页面加载，也运行现有 Playwright e2e。

## 11. 非目标

本次不做：

- 新增导出范围选择。
- 新增批量删除 Cookie / Storage。
- 新增加密、云同步或备份。
- 改变 background 消息协议。
- 改变 popup 布局。
- 改变数据模型或导入导出 JSON 格式。

## 12. 验收标准

1. 宽屏不再把账号、Cookie、Storage、导入导出四个重型区域并排展示。
2. 用户可以从左侧选择账号，并在右侧标签页切换概览、Cookie、Web Storage、工具。
3. Cookie 和 Web Storage 编辑能力与当前版本等价。
4. 导入导出和授权站点管理仍可用，但位于工具标签中。
5. 真实长 key、长 value、长 origin 不造成整页横向滚动。
6. 删除按钮不会脱离所属 Cookie 或 Storage 行。
7. 现有测试通过，并新增或更新覆盖标签页交互的 UI 测试。
