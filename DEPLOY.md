# 部署入口

当前分支同时包含 LinX 前端、新 TypeScript API、PostgreSQL、Redis，以及固定版本的 Baserow OSE 自定义镜像。

- 架构、启动、验收与回滚：[`docs/baserow-integration.md`](docs/baserow-integration.md)
- 服务器、域名、备份与监控：[`docs/baserow-server-requirements.md`](docs/baserow-server-requirements.md)
- Compose：[`deploy/docker-compose.yml`](deploy/docker-compose.yml)
- 正式环境 Nginx 示例：[`deploy/nginx-baserow.conf.example`](deploy/nginx-baserow.conf.example)

最短启动命令：

```bash
cp .env.example .env
# 修改 .env 中的密码、共享密钥和公开 URL
docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
```

不要继续使用旧文档中的 `server/` 路径；现行后端入口是 `backend/apps/api`。
