# SwitchAccounts V1 人工验收清单

## 基础安装

- [ ] `corepack pnpm build` 成功，加载 `.output/chrome-mv3` 后扩展可启动。
- [ ] `manifest.json` 是 Manifest V3。
- [ ] 固定权限只有 `cookies`、`storage`、`scripting`、`activeTab`。
- [ ] 站点权限位于 `optional_host_permissions`。
- [ ] 不声明 `tabs`、`<all_urls>`、`storage.sync` 或隐身窗口支持。

## 设计文档第 13 节验收

- [ ] 同一网站可保存至少两个账号。
- [ ] 不调用网站退出登录，也能在两个账号间往返切换。
- [ ] Cookie 覆盖注册域及全部子域。
- [ ] Web Storage 行为明确限制为当前 origin。
- [ ] 切换失败后不存在已知混合账号状态。
- [ ] 重置当前状态不会删除已保存账号。
- [ ] 覆盖失败不会损坏旧快照。
- [ ] Cookie 编辑只影响保存快照，不直接修改当前网站 Cookie。
- [ ] 明文 JSON 导出后，可在清空扩展数据的环境中完整导入。
- [ ] 敏感值不会写入日志或普通搜索结果。

## 操作流程

- [ ] 未保存账号时，Popup 显示“暂无账号配置”“新增账号”“重置当前状态”。
- [ ] 已保存账号时，Popup 支持按名称和备注搜索。
- [ ] 切换、覆盖、删除、重置均有确认提示。
- [ ] 新增账号不刷新当前网页。
- [ ] 覆盖账号不刷新当前网页。
- [ ] 删除账号不清理当前网站状态。
- [ ] 切换成功刷新当前标签页。
- [ ] 重置成功刷新当前标签页。

## 管理页

- [ ] 管理页按网站、账号名称和备注搜索。
- [ ] 管理页可重命名、修改备注和删除账号。
- [ ] Cookie 编辑器可按 Cookie 名称、域名和路径搜索。
- [ ] Cookie 编辑器可修改名称、值、域名、路径、Secure、HttpOnly、SameSite、Session/Expiration。
- [ ] Cookie 编辑器拒绝空名称、非法路径、SameSite=None 且未启用 Secure、持久 Cookie 无有效 Expiration。
- [ ] Web Storage 编辑器可编辑、删除并新增当前 origin 下的 localStorage/sessionStorage 条目。
- [ ] 导出前显示明文凭证警告。
- [ ] 导入前显示新增数量、覆盖数量和涉及站点。
- [ ] 设置区显示数据格式版本和已授权站点，并可撤销站点权限。

## 特殊页面和权限

- [ ] `chrome://` 页面不可操作。
- [ ] Chrome Web Store 页面不可操作。
- [ ] 未授权站点首次操作时触发权限申请。
- [ ] 用户拒绝权限后不读取 Cookie 或 Web Storage。
- [ ] 撤销站点权限后，再次操作需要重新授权。

## 重启和持久化

- [ ] 重启浏览器后已保存配置仍存在。
- [ ] 清空扩展数据后配置消失。
- [ ] 导入此前导出的 JSON 后配置恢复。

## 自动化补充说明

- [ ] `corepack pnpm test:e2e` 覆盖已授权站点下的 A/B 保存、切换、注册域/子域 Cookie、当前 origin Web Storage、重置、导出、清空扩展存储和导入恢复。
- [ ] E2E 为了稳定模拟“已授权站点”，只在临时复制的测试扩展 manifest 中加入 `host_permissions`；生产构建仍必须通过上方 manifest 检查保持可选主机权限。
