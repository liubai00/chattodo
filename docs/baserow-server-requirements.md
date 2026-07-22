# LinX × Baserow 服务器需求

## 内部试用起点

- 4 vCPU
- 8 GB RAM
- 30–50 GB SSD；附件功能未开放，但需为数据库增长和备份预留空间
- 64 位 Linux、Docker Engine 与 Docker Compose v2
- 正式环境公网只开放 80/443；PostgreSQL、Redis、LinX API 和 Baserow 容器端口只走 Docker 内网或本机反向代理

这是三人内部试用的工程起点，不是容量承诺。上线前应使用真实任务数、并发编辑、搜索和 AI 调用复核 CPU、内存、磁盘 IOPS 与 WebSocket 稳定性。

## 域名与 TLS

正式环境建议：

- `https://app.example.com`：LinX
- `https://tables.example.com`：Baserow

两者必须属于同一受控主域并使用有效 HTTPS 证书。配置必须精确一致：

```dotenv
LINX_PUBLIC_URL=https://app.example.com
LINX_PARENT_ORIGIN=https://app.example.com
BASEROW_PUBLIC_URL=https://tables.example.com
BASEROW_BIND_ADDRESS=127.0.0.1
```

不要在 `LINX_PARENT_ORIGIN` 中写路径或通配符。反向代理需支持 WebSocket Upgrade，并把 `X-Forwarded-Proto` 设为 `https`。

## 持久化与备份

需每日备份两份独立数据：

- LinX PostgreSQL 卷：使用 `pg_dump -Fc`。
- `linx-baserow-data` 卷：包含 Baserow 内置 PostgreSQL、Redis 持久状态和用户文件。为取得一致快照，短暂停止 `linx-baserow` 后再归档该卷。

备份应加密保存到另一台机器或对象存储，至少保留 14 个每日版本。每月至少做一次隔离环境恢复演练；“备份命令成功”不等于“可以恢复”。升级插件或 Baserow 前必须额外创建一次手工快照。

卷快照示例（会造成短暂停机）：

```bash
docker stop linx-baserow
docker run --rm -v linx-baserow-data:/source:ro -v /opt/linx-backups:/backup alpine \
  tar -czf /backup/baserow-YYYYMMDD.tar.gz -C /source .
docker start linx-baserow
```

恢复会覆盖数据，必须在维护窗口中由负责人按已验证的 runbook 执行。

## 监控与告警

至少监控：

- `GET /api/health`（LinX）和 `GET /api/linx/v1/health/`（Baserow 插件）。
- 容器重启次数、CPU、内存、卷剩余空间和磁盘 I/O 延迟。
- 5xx 比例、登录/票据兑换失败、WebSocket 断线和备份结果。
- Baserow 升级后插件加载、迁移、个人行隔离与实时过滤的回归结果。

日志中不得记录启动票据、邀请原文、Bearer token、共享密钥或完整聊天原话。来源审计属于产品数据，应按任务数据同等级保护。

## 版本约束

- 只构建 `baserow/baserow:2.3.2`，并设置 `BASEROW_OSS_ONLY=1`。
- 插件 API 是实验能力；禁止自动跟随 `latest`。
- 升级流程必须包含：备份、固定版本构建、三账号权限回归、桌面浏览器验收、回滚演练。
- Premium/Enterprise 功能不启用、不调用，也不从其目录复制实现。
