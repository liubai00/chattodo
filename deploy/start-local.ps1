# 本地部署：后端 8787 + 前端 preview 3000（含 /api 反代）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ">>> 构建前端..."
Push-Location $root
npm run build
Pop-Location

Write-Host ">>> 启动后端 (8787)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; npm run start" -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host ">>> 启动前端 preview (3000)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run preview" -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host ">>> 本地地址: http://127.0.0.1:3000/"
Write-Host ">>> 健康检查: http://127.0.0.1:3000/api/health"
