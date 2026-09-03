# SwitchAccounts Options 设计 QA

- source visual truth path: `C:\Users\Administrator\.codex\generated_images\01a0672e-093f-70c0-afbf-ad628c79f8d3\exec-eb0a6b0c-83f9-4961-992d-c774c1961991.png`
- prior implementation screenshot path: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-39b9fe1a-5751-4d5c-809f-433d3f1f57fc.png`
- refined implementation screenshot path: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-4e8c7cea-3af0-41c2-9921-7fb42908afc9.png`
- post-fix implementation screenshot path: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-cf041dc5-539f-45a5-bbc0-9946613ad523.png`
- viewport: 以用户重新加载扩展后的实际 Chrome 视口为准
- source pixels: 1440 x 1024
- prior implementation pixels: 2531 x 1318
- refined implementation pixels: 2420 x 1333
- post-fix implementation pixels: 1780 x 1308
- density normalization: 尚未执行
- state: “工具”工作区选中；账号列表列应完全隐藏；导出区默认全选账号并显示勾选列表

## Full-view comparison evidence

源设计与第一版实际工具页组成的对照图：`C:\Users\Administrator\.codex\visualizations\2026\09\03\01a0672e-093f-70c0-afbf-ad628c79f8d3\export-selection-comparison.png`。

源设计与修复后实际工具页组成的最终对照图：`C:\Users\Administrator\.codex\visualizations\2026\09\03\01a0672e-093f-70c0-afbf-ad628c79f8d3\export-selection-final-comparison.png`。

最终对照确认工具模式隐藏账号列表列、导入与授权两栏关系稳定，账号选择区与导出主操作在真实视口内形成完整闭环。

## Focused region comparison evidence

已重点检查导出区域：账号项在宽屏下以双列整行卡片呈现，名称和域名未出现异常换行；选择区内部滚动条位于正确边缘；选择数量和导出按钮同时可见。顶部标题在实现截图中被截断来自页面滚动位置，不属于布局裁切。

## Findings

- [Resolved P1] 导出账号项宽度被全局复选框规则压缩
  - Location: 工具与设置 / 导出账号备份 / 账号列表
  - Evidence: 第一版实际截图中，账号项选中背景只包裹文字，没有占满列表宽度；单列列表还将导出按钮推到首屏之外。
  - Impact: 可点击范围不明确，空间利用率低，选择完成后不能立即看到主操作。
  - Fix: 已提高账号项选择器优先级，恢复整列宽度；宽屏改为双列、列表高度收紧至 184px，窄屏保持单列。修复后截图确认通过。

## Comparison history

- Initial pass: 实际截图确认“工具”模式已正确隐藏账号列表列。
- Refinement pass: 重新组织导入导出信息层级并完成编译、64 项测试和生产构建；等待新版实际截图完成最后对照。
- Export selection pass: 新增多账号勾选、全选/清空、空选择禁用和带本地时间戳的文件名；编译、69 项测试和生产构建均通过，等待实际截图。
- Visual QA pass: 实际截图暴露账号项宽度和首屏操作完整性问题；已改为宽屏双列整行选项并压缩列表高度，重新通过编译、69 项测试和生产构建。
- Final pass: 修复后截图确认账号选项、内部滚动、选择数量和导出按钮关系正确，无 P0/P1/P2 遗留问题。

## Implementation checklist

- [x] 捕获重新加载后的“工具”工作区。
- [x] 验证账号列表列不存在，内容区紧邻窄导航栏并占满剩余宽度。
- [x] 验证导出账号列表在大量账号下可滚动、勾选状态清晰，导出按钮不会被挤压。
- [x] 测试“账号 / 工具”切换与关键控件。
- [x] 完成视觉对照并更新本报告。

## Follow-up polish

- P3：如后续账号数量非常多，可考虑增加导出账号搜索；当前 9 个账号的双列滚动选择已足够清晰。

final result: passed
