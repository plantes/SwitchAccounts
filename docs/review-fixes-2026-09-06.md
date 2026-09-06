# 2026-09-06 审查问题修复与验证

本轮修复审查确认的 13 项问题。数据格式继续使用 schemaVersion 2，浏览器最低版本为 Chrome 119。

| 审查编号 | 修复后的行为 | 验证位置 |
| --- | --- | --- |
| 1：页面跳转清错网站 | 所有页面存储操作和刷新绑定 documentId 与 origin，跳转后不操作新页面 | `tests/unit/web-storage.test.ts`、`tests/background/regressions.test.ts`、`tests/e2e/regressions.spec.ts` |
| 2：并发与旧快照覆盖 | 仓库变更串行执行；整包更新校验版本；重命名只更新名称 | `tests/background/regressions.test.ts`、`tests/ui/editor-regressions.test.tsx` |
| 3：导入重复 ID | 名称冲突保留本地 ID，新增 ID 冲突重新分配；历史重复记录自动修复并持久化 | `tests/background/regressions.test.ts`、`tests/e2e/regressions.spec.ts` |
| 4：备用脚本失败假成功 | 脚本返回明确成功/失败回执；异常或无效回执触发失败处理，不刷新 | `tests/unit/web-storage.test.ts`、`tests/background/regressions.test.ts`、`tests/e2e/regressions.spec.ts` |
| 5：分区 Cookie 残留 | 查询、清理和恢复包括全部分区 Cookie，并保留分区键 | `tests/unit/web-storage.test.ts`、`tests/e2e/regressions.spec.ts` |
| 6：连续输入丢字 | 同步更新本地草稿，仅在点击保存时提交 | `tests/ui/editor-regressions.test.tsx`、`tests/e2e/regressions.spec.ts` |
| 7：Cookie 编辑丢焦点 | 编辑名称、域名和路径不改变输入行标识 | `tests/ui/editor-regressions.test.tsx`、`tests/e2e/regressions.spec.ts` |
| 8：管理页吞掉错误 | 错误可见、失败保留草稿、允许修正重试；离开未保存编辑时提示 | `tests/ui/editor-regressions.test.tsx` |
| 9：无名 Cookie 无法保存 | 快照模型兼容 Chrome 合法的空名称 Cookie | `tests/background/regressions.test.ts`、`tests/e2e/regressions.spec.ts` |
| 10：域名搜索无效 | 在完整账号列表上对域名和名称进行或匹配 | `tests/ui/editor-regressions.test.tsx` |
| 11：导入预览晚于确认 | 先显示预览，通过独立按钮确认或取消；支持重新选择同一文件 | `tests/ui/editor-regressions.test.tsx` |
| 12：特殊存储键丢失 | 无原型字典捕获，校验保留原键，脚本参数经 JSON 字符串传输 | `tests/unit/web-storage.test.ts`、`tests/e2e/regressions.spec.ts` |
| 13：Escape 提交重命名 | Escape 跳过失焦提交，Enter 正常提交名称 | `tests/ui/editor-regressions.test.tsx` |

附带修复：JSON 值格式化保留大整数与转义原文，输入时不重新格式化；旧内容脚本不响应新版消息时可继续使用备用脚本。

验证命令：

```powershell
corepack pnpm compile
corepack pnpm test
corepack pnpm build
$env:SWITCHACCOUNTS_KEEP_E2E_ARTIFACTS = '1'
corepack pnpm test:e2e
```

设置 `SWITCHACCOUNTS_KEEP_E2E_ARTIFACTS=1` 时保留临时浏览器目录，便于检查且不执行清理删除。浏览器测试只在临时复制的扩展中预授权测试域名，生产扩展仍然使用可选网站权限。测试通过 Playwright 的独立 Chromium 运行，不操作个人浏览器数据。

使用更新后的 `.output/chrome-mv3` 时，需要到 `chrome://extensions/` 重新加载扩展。Cookie/Web Storage 编辑现在需要点击保存按钮；出现版本冲突时，先保留需要的草稿，再点击“重新载入”读取最新账号。
