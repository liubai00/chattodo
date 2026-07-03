#!/usr/bin/env bash
# Remote deploy script for Chattodo (frontend static + backend Docker).
# Designed to NOT touch existing sites: serves under /todo/ and proxies /todo/api/.
set -euo pipefail
ROOT=/opt/chattodo-deploy
CONF=/etc/nginx/conf.d/yc-power-agent-ip.conf

echo "=== [1/4] frontend static -> /var/www/chattodo ==="
rm -rf /var/www/chattodo
mkdir -p /var/www/chattodo
cp -r "$ROOT/dist/." /var/www/chattodo/
echo "frontend files: $(find /var/www/chattodo -type f | wc -l)"

echo "=== [2/4] backend container (127.0.0.1:8788) ==="
cd "$ROOT/deploy"
docker compose up -d --build
docker compose ps

echo "=== [3/4] nginx /todo/api/ reverse proxy ==="
if grep -q 'location /todo/api/' "$CONF"; then
  echo "already present, skip nginx edit"
else
  BAK="$CONF.bak-todoapi-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CONF" "$BAK"
  awk '
  /location \/todo\/ \{/ && !ins {
    print "    location /todo/api/ {";
    print "        proxy_pass http://127.0.0.1:8788/api/;";
    print "        proxy_set_header Host $host;";
    print "        proxy_set_header X-Real-IP $remote_addr;";
    print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;";
    print "        proxy_set_header X-Forwarded-Proto $scheme;";
    print "    }";
    ins=1
  }
  { print }
  ' "$CONF" > "$CONF.tmp" && mv "$CONF.tmp" "$CONF"
  if nginx -t; then
    systemctl reload nginx
    echo "nginx updated (backup: $BAK)"
  else
    echo "nginx -t FAILED -> rolling back"
    cp -a "$BAK" "$CONF"
    nginx -t && systemctl reload nginx
    exit 1
  fi
fi

echo "=== [4/5] daily Postgres backup cron ==="
mkdir -p /opt/chattodo-backups
# 备份脚本：容器内 pg_dump 自定义格式 → 拷到宿主，保留最近 14 份。
cat > /opt/chattodo-deploy/deploy/backup.sh <<'BK'
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d)
docker exec chattodo-postgres sh -c 'pg_dump -U chattodo -d chattodo -Fc -f /tmp/chattodo.dump'
docker cp chattodo-postgres:/tmp/chattodo.dump "/opt/chattodo-backups/chattodo-${STAMP}.dump"
docker exec chattodo-postgres rm -f /tmp/chattodo.dump
ls -1t /opt/chattodo-backups/chattodo-*.dump | tail -n +15 | xargs -r rm -f
BK
chmod +x /opt/chattodo-deploy/deploy/backup.sh
cat > /etc/cron.d/chattodo-backup <<'CRON'
30 3 * * * root /opt/chattodo-deploy/deploy/backup.sh >> /var/log/chattodo-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/chattodo-backup
echo "backup cron installed (03:30 daily pg_dump -> /opt/chattodo-backups)"

echo "=== [5/5] verify ==="
sleep 3
curl -s -o /dev/null -w "backend  127.0.0.1:8788/api/health -> %{http_code}\n" http://127.0.0.1:8788/api/health || true
curl -s -o /dev/null -w "nginx    /todo/api/health          -> %{http_code}\n" http://127.0.0.1/todo/api/health || true
curl -s -o /dev/null -w "frontend /todo/                    -> %{http_code}\n" http://127.0.0.1/todo/ || true
echo "--- existing-site sanity (must stay 200) ---"
curl -s -o /dev/null -w "default  /                         -> %{http_code}\n" http://127.0.0.1/ || true
echo "DEPLOY DONE"
