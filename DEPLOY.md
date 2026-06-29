# 部署指南

本项目是纯前端（Vite + React）静态站点，构建后是一堆静态文件，用 nginx 托管即可。

下面两种方式任选其一，**在你的服务器上执行**。

---

## 方式 A：Docker（推荐，最省心）

前提：服务器已装 Docker 和 docker compose。

```bash
# 1. 拉代码
git clone -b claude/initial-frontend-prototype-tdru0i https://github.com/liubai00/chattodo.git
cd chattodo

# 2. 构建并后台启动（首次会自动构建镜像）
docker compose up -d --build

# 3. 看状态
docker compose ps
docker compose logs -f web   # Ctrl+C 退出日志
```

完成后访问 `http://<服务器IP>/`。

> 80 端口被占用？把 `docker-compose.yml` 里的 `"80:80"` 改成 `"8080:80"`，再 `docker compose up -d --build`，然后访问 `http://<服务器IP>:8080/`。

更新版本：
```bash
git pull
docker compose up -d --build
```

停止：
```bash
docker compose down
```

---

## 方式 B：不用 Docker，直接 nginx 托管

前提：服务器有 Node 18+ 和 nginx。

```bash
# 1. 拉代码并构建
git clone -b claude/initial-frontend-prototype-tdru0i https://github.com/liubai00/chattodo.git
cd chattodo
npm ci
npm run build          # 产物在 dist/

# 2. 把产物放到 nginx 目录
sudo mkdir -p /var/www/chattodo
sudo cp -r dist/* /var/www/chattodo/

# 3. 配置 nginx 站点
sudo cp nginx.conf /etc/nginx/conf.d/chattodo.conf
# 把该配置里的 root 改成 /var/www/chattodo
sudo sed -i 's#/usr/share/nginx/html#/var/www/chattodo#' /etc/nginx/conf.d/chattodo.conf

# 4. 测试并重载
sudo nginx -t && sudo systemctl reload nginx
```

访问 `http://<服务器IP>/`。

---

## 注意事项

- **私有仓库**：若 `git clone` 提示需要认证，用你的 GitHub 账号/Token 登录，或先把仓库设为可访问。
- **防火墙/安全组**：确保云厂商安全组和服务器防火墙放行了对应端口（80 或你改的端口）。
- **当前为前端原型**：数据是浏览器内存里的 mock，刷新会重置。接入后端 API 后再做持久化。
- **HTTPS**：要上域名 + HTTPS，可在前面加一层 Caddy 或用 certbot 给 nginx 签证书，需要的话我再给配置。
