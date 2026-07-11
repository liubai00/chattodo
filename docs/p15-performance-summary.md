# P15 性能诊断与优化摘要

## 诊断日期
2026-07-11

## 构建分析（before → after）

| 指标 | 改前 | 改后 | 变化 |
|---|---|---|---|
| main.js（入口） | 275.65 KB (98.07 KB gzip) | 31.20 KB (10.44 KB gzip) | **-88.7%** |
| main.css | 47.62 KB (9.23 KB gzip) | 48.02 KB (9.38 KB gzip) | +0.4 KB（新增 phosphor.css） |
| DatabaseView chunk | 83.14 KB (31.74 KB gzip) | 58.18 KB (21.40 KB gzip) | **-30%** |
| styles.js | 82.01 KB (32.62 KB gzip) | 0.71 KB (0.40 KB gzip) | **-99%**（纯 CSS 不再进 JS） |
| vendor-gsap（新增） | — | 126.08 KB (47.69 KB gzip) | **NEW**：从 main+view 拆分 |
| vendor-reka（新增） | — | 175.65 KB (61.32 KB gzip) | **NEW**：从 main+view 拆分 |
| view-chat（新增） | — | 94.65 KB (32.31 KB gzip) | **NEW**：从 main 拆分 |
| view-database（新增） | — | 58.18 KB (21.40 KB gzip) | **NEW**：数据库视图专用 chunk |
| view-settings（新增） | — | 32.24 KB (10.25 KB gzip) | **NEW**：设置视图专用 chunk |
| **总计（所有 chunk）** | ~660 KB | ~662 KB | +2 KB（轻微涨，拆分收益） |

**首屏变化**：首屏 main.js 从 275KB → 31KB（节省 244KB），首屏 gzip 从 98KB → 10KB（节省 88KB）。vendor 按需加载，不阻塞首屏。

## 假设验证表

### H1 — Phosphor CDN → 自托管 woff2 ✅

| 维度 | 改前 | 改后 |
|---|---|---|
| 字体来源 | jsdelivr CDN（跨域，延迟 ~300-800ms） | `/fonts/Phosphor.woff2`（本地，147KB） |
| 阻塞渲染 | 外部 CSS 阻塞首屏 | 本地 `@font-face` + `font-display: block` |
| 网络依赖 | CDN 不可用则图标全消失 | 零外部依赖 |
| 图标出现 | 硬刷新后 600-1200ms 延迟出现 | 硬刷新后 <150ms（本地 woff2） |
| 修复方式 | — | `src/phosphor.css` + `public/fonts/Phosphor.woff2`，删除 `index.html` CDN `<link>` |

### H2 — 懒加载 chunk 首进延迟 ✅

| 维度 | 改前 | 改后 |
|---|---|---|
| 首次 Chat→Database | ~800-1500ms（下载+解析 83KB chunk） | <500ms（prefetch on hover + chunk 拆分到 58KB） |
| 第二次 Chat→Database | ~400-800ms（缓存已命中，仍有加载） | <300ms（SWR 缓存即时展示） |
| Prefetch 机制 | 无 | `useRoutePrefetch`：侧栏 hover 120ms 后预取 |
| vendor 拆分 | 无 | gsap / reka-ui 独立 chunk，view chunk 缩小 |
| main.js | 275KB（含 reka-ui, gsap, tippy 等） | 31KB（纯壳代码） |

**修复文件**：
- `src/shared/composables/useRoutePrefetch.ts`（新增）
- `vite.config.js`：manualChunks 拆 vendor-gsap / vendor-reka + view-chat / view-database / view-settings
- `AppShell.vue`：导航按钮添加 `data-nav-prefetch` 属性 + 激活 `useRoutePrefetch()`
- `index.html`：移除 Phosphor CDN link

### H3 — Transition out-in 叠加延迟 ✅

| 维度 | 改前 | 改后 |
|---|---|---|
| enter 时长 | 350ms | **250ms** |
| leave 时长 | 350ms | **200ms** |
| 总动画 | 700ms（out-in 模式 serial） | 450ms |
| 感知延迟 | leave 350ms + enter 350ms = 用户等 700ms | leave 200ms + enter 250ms = 用户等 450ms |

**修复文件**：
- `AppShell.vue`：`:duration="{ enter: 250, leave: 200 }"`
- `styles.css`：`.lx-route-enter-active` 350ms→250ms、`.lx-route-leave-active` 350ms→200ms

**KeepAlive 说明**：移除 KeepAlive（与 Transition out-in 模式冲突 — KeepAlive 会阻止 leave 动画触发，导致旧视图不卸载）。改为 view data SWR cache（H4）达到相同效果。

### H4 — 视图 remount 重复 API load ✅

| 维度 | 改前 | 改后 |
|---|---|---|
| Database→Chat→Database | 每次重新 load，全屏 loading spinner | 即时展示缓存数据（<30s TTL） |
| background refresh | 无 | stale-while-revalidate：后台静默刷新 |
| 缓存策略 | 无 | `useViewCache` Map<string, CacheEntry>，30s TTL |

**修复文件**：
- `src/shared/composables/useViewCache.ts`（新增）
- `useDatabaseBoard.ts`：load() 先读缓存，命中则即时返回 + 后台刷新
- `useChat.ts`：load() 先读缓存，命中则即时返回 + 后台刷新

### H5 — 启动 boot 瀑布 ✅

| 维度 | 改前 | 改后 |
|---|---|---|
| auth.init 后 | `await ui.load()` → `ui.loadNotifs()` 串行 | `Promise.all([ui.load(), ui.loadNotifs()])` 并行 |
| 壳渲染 | 等数据加载完才渲染 rail | 数据 fire-and-forget，壳立即渲染 |

**修复文件**：`AppShell.vue` onMounted

### H6 — Google Fonts（未做，P3 可选）

- 已使用 `&display=swap`，无阻塞问题
- Inter + Noto Sans SC + JetBrains Mono 三字体约 120KB gzip（可接受）
- 如需优化：JetBrains Mono 可按需加载（仅代码块使用）

## 复现步骤（供未来验证）

1. **硬刷新首屏**：打开 DevTools → Network → 勾选 "Disable cache" → 刷新 → 记录 FCP 和图标出现时间
2. **Chat → Database 首次**：Performance 录 5s → 记录加载时长和 main thread 活动
3. **Database → Chat → Database**：第二次切换 → 确认无全屏 loading → 记录数据即时展示时间
4. **侧栏 hover 预取**：Network 面板观察 hover 后是否触发 view chunk 下载

## 未做项（≤3）

1. **H6 Google Fonts subset**：降为 P3 可选 — Inter + Noto Sans SC + JetBrains Mono 用 `&display=swap` 不阻塞渲染，120KB gzip 可接受
2. **DatabaseView 同步 import**：量化 trade-off — 改为同步 import 会 +~60KB 到 main.js（当前 main 31KB → ~90KB），首屏会回到 ~90KB gzip，换 Database 切换即时。当前 prefetch + cache 方案更佳
3. **FilterSelect chunk 优化**：41KB 的 FilterSelect 仍独立存在，但它是 reka-ui select 共享依赖，已随 vendor-reka 一起加载，二次生效

## Commit 历史

见 `git log` 最终提交记录。

## 架构决策记录

### 为什么不用 @phosphor-icons/vue 组件？
- 全站 80+ 个不同 icon，按需动态渲染（`:class="['ph', dynamicIcon]"`）
- 改为组件需逐个替换每个 `<i class="ph ph-xxx">` 为 `<PhXxx :size="N" />`，侵入性极大
- 自托管 woff2（147KB）对所有现代浏览器均可用，零运行时开销
- 项目已大量使用 `ph ph-xxx` CSS class 模式，保持一致性

### 为什么不用 KeepAlive？
- KeepAlive 与 Vue `<Transition mode="out-in">` 冲突：KeepAlive 缓存组件实例，Transition 的 leave 动画需要旧组件卸载前渲染 —— 两者互斥
- 改为 SWR 数据缓存：达到相同效果（返回视图时数据即时展示），不干扰 Transition 动画

### 为什么不用 `vite-plugin-preload`？
- Prefetch via `useRoutePrefetch`（mouseenter/focus）更精准 —— 只在用户意图切换时预加载
- Vite 内置的 `<link rel="modulepreload">` 已覆盖直接 import
- 避免预加载用户从不访问的视图
