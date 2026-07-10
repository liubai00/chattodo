# LinX 灵信 · Chattodo（Web 前端）

> AI 原生的想法处理器：信息可以进来，但只有行动能留在主系统里。
> 自然语言输入即自动 triage —— 明确 todo 进数据库、模糊 todo 进待澄清、非 todo 进隔离输出。

本仓库为 chattodo 的 **Web 前端**（Vue 3 单页应用）。后端（Fastify + PGlite）位于 [`./server`](./server)，前端通过 Vite 代理 `/api` -> `http://localhost:8787`。

## 技术栈

- **Vue 3** `<script setup>` + **TypeScript**（严格模式，禁止 `any`）
- **Vite 5** 构建（两个独立入口：主站 `index.html` + 监控后台 `admin/index.html`）
- **Pinia 3** 状态管理（auth / ui / events / toast）
- **Vue Router 5**（**hash 模式**，`#/chat`、`#/database` 等，避开生产 `/todo/` 下的 nginx history fallback 配置）
- **Tailwind CSS v4**（`@tailwindcss/vite`，`@theme inline` 映射 Attio 设计令牌，无 preflight 以兼容遗留内联样式）
- **shadcn-vue / reka-ui** 基础组件
- **GSAP**（`src/motion/`：v-fade / v-stagger 指令、路由过渡、FLIP 看板拖拽动效）

## 前置要求

- **Node.js ≥ 22.12**（22.9 会触发若干依赖的 `EBADENGINE`，且 Vite 热重载偶发 `Cannot find package '@tailwindcss/vite'`；建议升级到 22.12 / 22.18）。
- 本环境直连 `registry.npmjs.org` 会 `ECONNRESET`，统一走 npmmirror。

## 安装

```bash
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps
```

> `--legacy-peer-deps`：reka-ui / pinia3 / vue-router5 的 peer 范围较宽，加此参数避免无谓的 peer 冲突。

## 前端脚本

```bash
npm run dev          # 开发服务器 http://localhost:3000（PORT 可覆盖）
npm run type-check   # vue-tsc --noEmit 类型检查
npm run build        # 生产构建 -> dist/（主站）+ dist/admin/（后台）
npm run preview      # 预览构建产物
npm run test         # Vitest 单元测试（见下）
```

## 后端

```bash
cd server
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps
npm run dev          # http://localhost:8787
```

PGlite（进程内 WASM Postgres）数据目录注意点：

- 无 `DATABASE_URL` 时使用 PGlite，目录由 `server/.env` 的 `PGLITE_DIR` 指定。
- 原始 `./data/pgdata` 目录曾损坏（PGlite 在 `_pg_initdb` 处中止），现以 `./data/pgdata-fresh` 工作，`.env` 已指向它。
- 重新初始化数据：`node src/db/bootstrap.js`（建表 + 从 Sqlite 迁移或注入 demo）。
- Demo 登录：邮箱 `demo@linx.team` / 密码 `linx2026`（登录接口字段为 `email`）。

## 目录结构（前端）

```
src/
  app/
    Root.vue            # RouterView 出口
    AppShell.vue        # 应用壳：登录屏 + 侧栏 + 视图 switch + toast + 详情面板
    router.ts           # hash 路由，8 视图 + catch-all
    views/              # ChatView / DatabaseView / ProjectsView / FriendsView /
                        # ClarifyView / NonTodoView / AgentView / SettingsView / TaskDetailView
    composables/        # usePane（分栏拖拽 resize）等
  stores/               # Pinia: auth / ui / events / toast
  lib/                  # api.ts（后端客户端）/ keyboard.ts / timeTokens.ts / theme.ts / format.ts / utils.ts
  motion/               # GSAP 指令与 FLIP
  components/ui/        # shadcn-vue 基础组件
  types/api.ts          # 领域类型
admin/
  Admin.vue             # 监控后台（独立入口，构建到 dist/admin/，由 nginx 挂在 /todo/admin/）
```

## 路由

hash 模式，路由表见 [`src/app/router.ts`](./src/app/router.ts)：

| 路径 | 名称 | 说明 |
|------|------|------|
| `#/chat` | chat | 常驻聊天 + 任务（默认首页） |
| `#/database` | database | Todo 数据库（看板 / 表格） |
| `#/projects/:selId?` | projects | 项目 |
| `#/friends` | friends | 好友 |
| `#/clarify/:selId?` | clarify | 待澄清想法 |
| `#/nontodo/:selId?` | nontodo | 非 todo 隔离输出 |
| `#/agent` | agent | Agent 设置 |
| `#/settings` | settings | 应用设置 |

`:selId?` 为跨视图深选参数（从其它视图跳转时自动选中对应条目）。

## 重构状态

前端已完成 **P3–P5** 绞杀式迁移：从旧的 253KB `App.vue`（React-in-Vue 状态机）逐步迁移到 **TS + Pinia + Router + Tailwind v4 + shadcn-vue**，8 个视图 + 详情面板 + 应用壳全部 TS 化，遗留 `App.vue` / Component 类 / 路由桥接已删除，`type-check` 与 `build` 全绿。

补齐的桌面端一致性能力：通知面板 + 未读徽标、搜索 ⌘K 命令面板、快捷键、FLIP 看板拖拽动效、今日待办胶囊、跨视图深选、分栏 resize。

移动端布局第一版已铺全部视图但 **暂停**（代码全 gate 在 `isMobile` 后，桌面端零影响），待桌面端收尾后集中做一轮。

## 构建体积

路由级懒加载后（首屏 `ChatView` 同步、其余视图按需加载）：主 chunk ≈ **207 kB（gzip 73 kB）**，较懒加载前 316 kB 降约 35%；各视图拆为独立 chunk（gzip 2.4–11.3 kB），GSAP Flip 9.6 kB、reka-ui 共享 30 kB（均 gzip）。详见 `npm run build` 输出。
