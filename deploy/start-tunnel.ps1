# 启动 Cloudflare 快速隧道（无需域名，适合临时外网访问）
# 用法：powershell -ExecutionPolicy Bypass -File deploy/start-tunnel.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cf = Join-Path $root "tools\cloudflared.exe"
$port = if ($env:PORT) { $env:PORT } else { "3000" }

if (-not (Test-Path $cf)) {
  Write-Error "找不到 cloudflared：$cf`n请先运行 deploy/install-cloudflared.ps1"
}

Write-Host ">>> 检查本地服务 http://127.0.0.1:$port ..."
try {
  $null = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5
  Write-Host ">>> 本地 API 正常"
} catch {
  Write-Warning "本地服务未就绪，请先启动前后端（deploy/start-local.ps1）"
}

Write-Host ">>> 启动 Cloudflare 快速隧道 -> http://127.0.0.1:$port"
Write-Host ">>> 公网 URL 会在下方日志里出现（*.trycloudflare.com）"
& $cf tunnel --url "http://127.0.0.1:$port"
