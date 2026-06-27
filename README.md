# Chattodo · AI 想法处理器（Web 前端原型）

基于 *AI Todo MVP Kickoff Brief* 的第一版前端原型。核心理念：
**这不是信息管理系统，而是 todo 类想法处理器。** 信息可以进来，但只有行动能留在主系统里。

> 当前为纯前端原型：使用内存中的 mock 数据 + 规则版 triage（`LocalRuleProvider` 的占位实现），
> 用于快速验证产品闭环与视觉方向。刷新页面会回到初始数据，后续接入服务端与真实 LLM。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建
```

## 已实现

三栏布局：**左侧导航 · 中间主区域 · 右侧常驻聊天框**，并做了基础响应式。

- **工作台 Dashboard** — 今日/Inbox/未完成/隔离 四项统计、一键「接下来两小时计划」、最近待澄清、今日任务。
- **常驻聊天框 Chat Dock** — 自然语言输入即自动 triage：
  - 明确 todo → 进入 Todo 数据库
  - 模糊 todo → 进入 Todo Inbox，给出建议下一步
  - 非 todo → 进入隔离输出，明确提示「未进入主系统」
  - 问「接下来两小时做什么」→ 只基于可见 Task 生成计划
- **Todo Inbox** — 待澄清想法，可转任务 / 归档 / 丢弃。
- **Todo 数据库** — 全部 / 今日 / 未完成 / 已完成 视图，表格化字段，勾选完成。
- **NonTodo 隔离输出** — 琥珀色视觉区分，可复制 / 导出 / 手动转 todo（需显式触发）/ 删除。
- **Agent 设置** — soul / memory / preferences / workingStyle / privacyRules / followup 表单。
- **App 设置** — 空间切换、隐私模式、默认视图、AI 可见范围。
- **隐私模式** — 顶部明确状态；开启后主系统与隔离区均按 workspace 范围过滤，计划只读可见内容。

## 视觉方向

- 极简、内容优先、类 Notion 但避免工具栏拥挤。
- Todo 主系统：绿色/蓝色稳定色。
- NonTodo 隔离区：琥珀色，刻意不像任务。

## 目录结构

```
src/
  lib/
    triage.js      # 规则版输入分类（task / todo_idea / non_todo）
    planning.js    # plan_next_block：只读可见 Task
    seed.js        # mock 种子数据
    utils.js       # 时间/范围/优先级格式化
  store.jsx        # 内存状态 + 动作 + 隐私过滤
  components/      # Sidebar / Topbar / ChatDock / chips
  pages/           # Dashboard / Inbox / Database / NonTodo / Agent / App 设置
```

## 下一步（对照 brief）

- 接入服务端 API（`GET /api/state`、`POST /api/capture`、`POST /api/chat` …）替换内存 store。
- 用真实 LLM provider 替换 `LocalRuleProvider`。
- CLI 客户端复用同一套服务层。
