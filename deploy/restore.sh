#!/usr/bin/env bash
# 从每日 pg_dump 备份恢复 Chattodo 的 Postgres 数据库。
# 备份由 setup.sh 安装的 cron（03:30）生成，落在宿主 /opt/chattodo-backups。
# 用法：bash restore.sh [备份文件名]  （不带参数则列出可选备份）
set -euo pipefail
BK_DIR=/opt/chattodo-backups

if [ $# -lt 1 ]; then
  echo "可用备份（在 $BK_DIR）："
  ls -1t "$BK_DIR"/chattodo-*.dump 2>/dev/null || echo "（暂无备份）"
  echo
  echo "恢复命令：bash restore.sh chattodo-YYYYMMDD.dump"
  exit 0
fi

SRC="$BK_DIR/$1"
[ -f "$SRC" ] || { echo "找不到备份文件：$SRC"; exit 1; }

echo "!! 这会用 $1 覆盖当前数据库，当前数据将丢失。"
read -r -p "确认恢复？输入 yes 继续：" ans
[ "$ans" = "yes" ] || { echo "已取消"; exit 0; }

echo "[1/4] 停止 api 容器（避免写入）…"
docker stop chattodo-api

echo "[2/4] 拷入备份并重建数据库…"
docker cp "$SRC" chattodo-postgres:/tmp/restore.dump
# 断开其它连接，drop+create 干净库，再 pg_restore
docker exec chattodo-postgres psql -U chattodo -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='chattodo' AND pid<>pg_backend_pid();" || true
docker exec chattodo-postgres psql -U chattodo -d postgres -c "DROP DATABASE IF EXISTS chattodo;"
docker exec chattodo-postgres psql -U chattodo -d postgres -c "CREATE DATABASE chattodo OWNER chattodo;"
docker exec chattodo-postgres pg_restore -U chattodo -d chattodo --no-owner /tmp/restore.dump
docker exec chattodo-postgres rm -f /tmp/restore.dump

echo "[3/4] 重启 api 容器…"
docker start chattodo-api
sleep 5

echo "[4/4] 健康检查…"
curl -s -o /dev/null -w "health -> %{http_code}\n" http://127.0.0.1:8788/api/health || true
echo "恢复完成。"
