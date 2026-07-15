# LinX 灵信 · 后端 Monorepo（`backend/`）

> 后端重构落地工程。设计依据见 `../docs/backend-*.md`（需求 → 架构设计 → 决策 ADR-000 → 对抗评审 → 可靠性收口 → 六篇细化 + 迁移计划）。**施工前必读 `../docs/backend-reliability-amendment.md`。**

## 为什么在子目录 `backend/`

仓库根目录是**前端 npm 工程**（`chattodo-web` + Vite + `package-lock.json`）。为遵守「前端暂不改动」并避免两个包管理器（npm/pnpm）在同一 root 争抢 `node_modules`，后端 monorepo 独立落在 `backend/`，自带 pnpm workspace。

- 设计文档以「repo 根即 monorepo 根」描述；本工程等价映射为 `backend/` 为 monorepo 根。
- 现网 `../server/`（在线后端）在整个 Strangler 迁移期**原封不动**；P1 起被封装为 `packages/legacy`（本仓 `../server` 暂不动）。
- 部署（P8）：`deploy/docker-compose.yml` 的构建 context 由 `../server` 改为 `../backend`，宿主 nginx `/todo/api/ → 127.0.0.1:8788` **一字不改**。

## 当前阶段：P0（脚手）

按 `../docs/backend-migration-plan.md` §2，P0 = **纯新增、零触碰现网**：monorepo/TS/CI/三道闸 + `kernel-*`/`contracts-*` 骨架 + 空 `apps/api`（仅 `/health`）。

已落地包：

| 包 | 作用 |
|---|---|
| `@linx/kernel-types` | Brand/Opaque/DeepReadonly 等类型基元 |
| `@linx/kernel-result` | `Result<T,E>` 显式错误传播 |
| `@linx/kernel-errors` | `AppError` + 错误码 + 扁平错误信封（兼容前端） |
| `@linx/kernel-ids` | UUIDv7 + 前缀化 typed-id（修 P6 makeId） |
| `@linx/kernel-clock` | Clock 端口 + UTC 时间（修 P7 nowIso） |
| `@linx/contracts-http` | HTTP 契约（Zod）；P0 仅 health + 错误信封 |
| `@linx/contracts-events` | 事件契约骨架 |
| `@linx/api` (apps/api) | Fastify 宿主；P0 仅 `GET /health` |

后续阶段（P1 platform-* + Facade + auth，P2–P6 各 BC，P7 Agent，P8 下线旧实现）见迁移计划。

## 三道边界闸

1. **TS project references**（编译期）：未在 `tsconfig.json` `references` 列出的包，物理 import 不到。
2. **dependency-cruiser**（CI 红线）：`.dependency-cruiser.cjs` 六禁令（越层/跨域/环/深 import）。
3. **eslint-plugin-boundaries**（编辑器实时）：P1 接入（需 flat-config 适配）。

## 命令

```bash
corepack enable                 # 启用 pnpm（首次）
pnpm install
pnpm run build                  # tsc -b：按依赖顺序增量构建全量包（含 typecheck）
pnpm run depcruise              # 边界闸 2
pnpm run test                   # vitest
pnpm run check                  # build + depcruise + test（本地全量闸）
pnpm run start:api              # 起 apps/api（默认 127.0.0.1:8787）
pnpm run dev:api                # tsx watch 开发模式
```

DoD（P0 退出判据）：`pnpm run check` 全绿；`apps/api` 可起，`GET /health` 返回 `{ ok: true, ... }`。

## 命名与结构约定

- 包名 `@linx/<prefix>-<context>[-<tech>]`；前缀白名单：`kernel/contracts/platform/domain/app/infra/agent/apps`。
- 每包唯一 `src/index.ts` barrel，显式具名导出，禁 `export *`。
- 纯 ESM（`"type":"module"`），NodeNext，相对 import 带 `.js` 后缀。
- 详见 `../docs/backend-package-structure.md`（含新增实体/模块/Agent/Tool 的 copy-paste 模板）。
