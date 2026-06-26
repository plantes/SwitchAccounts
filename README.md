# SwitchAccounts

SwitchAccounts 是一个 Chrome Manifest V3 扩展，用于保存网站的本地登录状态，并在不点击网站“退出登录”的前提下快速切换账号。

首版保存：

- 当前注册域及全部子域的 Cookie。
- 当前页面 origin 的 `localStorage`。
- 当前页面 origin 的 `sessionStorage`。

首版不处理 IndexedDB、Cache Storage、云同步、加密或隐身窗口。

## 开发

```powershell
corepack pnpm install
corepack pnpm dev
corepack pnpm test
corepack pnpm compile
corepack pnpm build
```

构建产物位于 `.output/chrome-mv3`。

## 权限说明

固定权限：

- `cookies`：读取、清理和恢复网站 Cookie。
- `storage`：把账号配置保存到 `chrome.storage.local`。
- `scripting`：为当前页面注入 Web Storage 操作脚本。
- `activeTab`：由用户点击扩展图标后访问当前标签页。

网站权限不会在安装时一次性申请。扩展会在用户对某个网站执行保存、切换、覆盖或重置等操作时，按注册域申请 HTTP/HTTPS 主域与全部子域权限。

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
- 重置当前状态只清理网站状态，不删除已保存账号。
- 删除账号只删除保存配置，不修改当前网站状态。
- Cookie 编辑只修改保存快照，不直接修改当前网站。
