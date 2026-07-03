#!/usr/bin/env bash
# 从每日备份恢复 Chattodo 数据库。
# 备份由 setup.sh 安装的 cron（03:30）生成，落在宿主 /opt/chattodo-backups。
# 用法：bash restore.sh [备份文件名]  （不带参数则列出可选备份）
set -euo pipefail
BK_DIR=/opt/chattodo-backups

if [ $# -lt 1 ]; then
  echo "可用备份（在 $BK_DIR）："
  ls -1t "$BK_DIR" 2>/dev/null || echo "（暂无备份）"
  echo
  echo "恢复命令：bash restore.sh chattodo-YYYYMMDD.db"
  exit 0
fi

SRC="$BK_DIR/$1"
[ -f "$SRC" ] || { echo "找不到备份文件：$SRC"; exit 1; }

echo "!! 这会用 $1 覆盖当前数据库，当前数据将丢失。"
read -r -p "确认恢复？输入 yes 继续：" ans
[ "$ans" = "yes" ] || { echo "已取消"; exit 0; }

echo "[1/3] 停止 api 容器…"
docker stop chattodo-api

echo "[2/3] 覆盖数据库文件…"
docker cp "$SRC" chattodo-api:/data/chattodo.db
# 清掉可能存在的 WAL/SHM，避免与恢复的主库不一致
docker run --rm -v chattodo-data:/data alpine:3 sh -c 'rm -f /data/chattodo.db-wal /data/chattodo.db-shm' || true

echo "[3/3] 重启 api 容器…"
docker start chattodo-api
sleep 3
curl -s -o /dev/null -w "health -> %{http_code}\n" http://127.0.0.1:8788/api/health || true
echo "恢复完成。"
