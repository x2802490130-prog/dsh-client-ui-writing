# dsh-client-ui-writing

DeepSeek Harness（DSH）Web 客户端「写作」面板：为长篇网文创作提供书库、项目进度、全文检索、设定演化与线索图谱的可视化工作台。host 侧需配套 [dsh-writing-remote](https://github.com/x2802490130-prog/dsh-writing-remote)（引擎本体为 [dsh-tool-writing](https://github.com/x2802490130-prog/dsh-tool-writing)）。

## 功能

- **项目视图**：分卷/章节目录（字数、状态、摘要）、全书统计、情节日志尾部预览
- **书库（饲料区）**：多本小说的列表、阅读与全文检索（SQLite FTS5 trigram + LIKE）
- **全文检索**：项目 + 书库联合检索，点击命中直达对应章节
- **演化 tab**：设定/人物演化条目，带版本链 diff 与陈旧检测
- **线索图谱**：多线叙事线索的 SVG 线程图（交汇点可视化）
- **模式门控**：只在「写作」预设（agentPreset === writing）的会话显示

## 安装

```bash
npm install dsh-client-ui-writing
# 或
dsh plugin --profile web add dsh-client-ui-writing
```

peerDependencies：`react@^18.2.0`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`（官方包走 peer，不内嵌）。
