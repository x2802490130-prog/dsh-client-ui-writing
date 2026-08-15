# dsh-client-ui-writing

DeepSeek Harness（DSH）Web 客户端的「写作」工作台：为长篇网文创作提供侧边栏写作面板 + 会话内全书索引视图。是三件套的前端——引擎本体是 [dsh-tool-writing](https://github.com/x2802490130-prog/dsh-tool-writing)，host 侧数据通道是 [dsh-writing-remote](https://github.com/x2802490130-prog/dsh-writing-remote)。

## 三件套分工

```
┌─ dsh-client-ui-writing（本包，浏览器）──┐
│  侧边栏面板 · 会话内索引视图 · 快捷键      │
└──────────────┬─────────────────────────┘
               │ Typert remote（只读 + 编排触发）
┌──────────────▼─────────────────────────┐
│ dsh-writing-remote（host）              │
│  项目/书库/检索/演化/线索 数据服务        │
└──────────────┬─────────────────────────┘
               │
┌──────────────▼─────────────────────────┐
│ dsh-tool-writing（host）                │
│  写文引擎：生成/检索/书库/编排            │
└────────────────────────────────────────┘
```

面板**只读数据 + 触发编排**，不直接生成正文；所有重活都在 host 侧由引擎完成。

## 功能

### 侧边栏「写作」面板

挂在侧边栏底部，四个 tab：

| tab | 内容 |
|---|---|
| **项目** | 分卷/章节目录（字数、状态、摘要）；全书统计（章数/总字数/未回收伏笔/演化记录）；情节日志尾部预览；空项目一键初始化写作工程（`scaffoldNow`，幂等不破坏） |
| **书库** | 饲料区所有小说：书名/作者/分类/章数/字数；空时提示用 `novel_library_import` 导入 |
| **搜索** | 项目 + 书库联合全文检索（SQLite FTS5），搜人名/设定/情节，命中直达对应章节 |
| **演化** | 设定/人物演化版本链：主体列表（按主体去重）→ 点击看该主体的完整版本链内联 diff；线索图谱（SVG 线程图，多线叙事的交汇点可视化）；空时提示跑 `novel_sync` / `novel_threads` 登记 |

面板头部还有「章末编排」按钮：一键触发 `novel_sync`（章节摘要 + 设定抽取 + 演化检测 + 伏笔提醒）。

### 会话内全书索引视图

在「写作」预设的会话里，顶部「对话/轨迹」旁多一个索引 tab：

- 全书索引：分卷目录、字数/状态/摘要、快速定位、章节预览、打开原文
- 纯数字直达第 N 章；`/ ` 或 `Ctrl+/ `、`Alt+K` 聚焦搜索框
- `↑↓` 选择、`Enter` 预览、`Esc` 关闭；触摸/拖拽左右滑动切换模块
- 快捷键总线在插件加载时以捕获阶段挂到 window，先于应用拿到按键；切出写作会话后组件卸载、处理器自动失效

### 模式门控

只在「写作」预设（`agentPreset === "writing"`）的会话显示面板与索引视图，其他会话完全隐身。

## 安装

```bash
dsh plugin --profile web add dsh-client-ui-writing
# 或
npm install dsh-client-ui-writing
```

前置：host 侧需安装 [dsh-writing-remote](https://www.npmjs.com/package/dsh-writing-remote)（它依赖 [dsh-tool-writing](https://www.npmjs.com/package/dsh-tool-writing)）；引擎需要独立的 `DSH_WRITING_API_KEY`（见 tool-writing 的 README）。

peerDependencies：`react@^18.2.0`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`（官方包走 peer，不内嵌）。

## 许可证

MIT。
