# SwitchAccounts

SwitchAccounts 是一个 Chrome Manifest V3 扩展，用于保存网站的本地登录状态，并在不进入网站退出流程的情况下快速切换账号。

它会保存：

- 当前注册域及全部子域的 Cookie。
- 当前页面 origin 的 `localStorage`。
- 当前页面 origin 的 `sessionStorage`。

当前版本不处理 IndexedDB、Cache Storage、云同步、加密或隐身窗口。

## 功能

- Popup 工作台：保存当前登录状态、切换账号、覆盖快照、删除快照、登出当前站点。
- Options 管理页：账号搜索与管理、Cookie 快照编辑、Web Storage 快照编辑、导入 / 导出、授权站点撤销。
- Chrome 图标：使用双钥匙图标，并在 `16/32/48/128px` 尺寸下配置到 `manifest.icons` 和 `action.default_icon`。

## 开发

```powershell
corepack pnpm install
corepack pnpm dev
corepack pnpm test
corepack pnpm compile
corepack pnpm build
```

构建产物位于 `.output/chrome-mv3`。在 Chrome 的 `chrome://extensions/` 中加载该目录；更新图标或 manifest 后，需要重新加载扩展。

## 权限说明

固定权限：

- `cookies`：读取、清理和恢复网站 Cookie。
- `storage`：把账号配置保存到 `chrome.storage.local`。
- `scripting`：为当前页面注入 Web Storage 操作脚本。
- `activeTab`：由用户点击扩展图标后访问当前标签页。

网站权限不会在安装时一次性申请。扩展会在用户对某个网站执行保存、切换、覆盖或登出等操作时，按注册域申请 HTTP/HTTPS 主域与全部子域权限。

## 安全边界

- 保存的 Cookie 和 Web Storage 可能包含可直接使用的登录凭证。
- 数据仅保存到本机 `chrome.storage.local`。
- 不使用 `chrome.storage.sync`。
- 不上传域名、Cookie、Web Storage 或导出文件。
- 导出 JSON 是 UTF-8 明文文件，请勿上传、分享或保存在不可信位置。
- 普通搜索不匹配 Cookie 值或 Web Storage 值。

## 关键行为

- 切换账号时先清理当前注册域 Cookie 和当前 origin Web Storage，再恢复目标账号。
- 恢复任一关键数据失败时会再次清理目标范围，不刷新页面，不自动恢复切换前账号。
- 登出当前站点只清理网站状态，不删除已保存账号。
- 删除账号只删除保存配置，不修改当前网站状态。
- Cookie 和 Web Storage 编辑只修改保存快照，不直接修改当前网站。
