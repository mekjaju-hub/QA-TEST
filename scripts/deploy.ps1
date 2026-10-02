# WebQA2026 - one-click deploy (Docker Desktop, Windows)
# Usage: double-click DEPLOY.bat in the project folder
#   - creates .env from .env.example on first run (random POSTGRES_PASSWORD)
#   - docker compose up -d --build
#   - waits until all services are healthy and the web answers, then opens the browser
#   - writes a log to storage\exports\deploy_<timestamp>.log (send it to Claude if something fails)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path "$root\storage\exports" | Out-Null
$log = "$root\storage\exports\deploy_$ts.log"
function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c; Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m) -Encoding UTF8 }

Say "== WebQA2026 deploy ($ts) ==" "Cyan"

# 1) Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Say "ไม่พบคำสั่ง docker - ติดตั้ง Docker Desktop ก่อน" "Red"; exit 1 }
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Say "Docker Engine ยังไม่ทำงาน - กำลังรอ (เปิด Docker Desktop ไว้)..." "Yellow"
  $ok = $false
  for ($i = 0; $i -lt 36; $i++) { Start-Sleep 5; docker info *> $null; if ($LASTEXITCODE -eq 0) { $ok = $true; break } }
  if (-not $ok) { Say "Docker Engine ไม่พร้อมภายใน 3 นาที - เปิด Docker Desktop ให้ขึ้น 'Engine running' แล้วลองใหม่" "Red"; exit 1 }
}
Say ("Docker: " + (docker version --format "{{.Server.Version}}" 2>$null)) "Green"

# 2) .env
if (-not (Test-Path "$root\.env")) {
  $envText = Get-Content "$root\.env.example" -Raw -Encoding UTF8
  $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $envText = $envText -replace "(?m)^POSTGRES_PASSWORD=.*$", "POSTGRES_PASSWORD=$pw"
  [IO.File]::WriteAllText("$root\.env", $envText, (New-Object Text.UTF8Encoding $false))
  Say "สร้าง .env แล้ว (AI_MODE=rule, รหัส PostgreSQL สุ่มใหม่)" "Green"
} else { Say "ใช้ .env เดิม" }
$port = ((Select-String -Path "$root\.env" -Pattern "^APP_PORT=(\d+)").Matches.Groups[1].Value); if (-not $port) { $port = "3000" }

# 3) Build + start
Say "กำลัง build และ start (ครั้งแรกอาจใช้ 5-15 นาที)..." "Cyan"
docker compose up -d --build 2>&1 | Tee-Object -Variable out | Out-Host
Add-Content -Path $log -Value ($out -join "`n") -Encoding UTF8
if ($LASTEXITCODE -ne 0) {
  Say "docker compose up ล้มเหลว - ดู log: $log" "Red"
  docker compose logs --tail 200 2>&1 | Add-Content -Path $log -Encoding UTF8
  exit 1
}

# 4) Wait for health + web
Say "รอให้ทุก service พร้อม..." "Cyan"
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 5
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/login" -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) {
        $h = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 5; if ($h.StatusCode -eq 200) { $ready = $true; break } } } catch {}
}
docker compose ps 2>&1 | Tee-Object -Variable ps | Out-Host
Add-Content -Path $log -Value ($ps -join "`n") -Encoding UTF8
if (-not $ready) {
  Say "ระบบยังไม่พร้อมภายใน 5 นาที - เก็บ log ไว้ที่ $log" "Red"
  docker compose logs --tail 200 2>&1 | Add-Content -Path $log -Encoding UTF8
  exit 1
}
Say "พร้อมใช้งาน: http://localhost:$port  (admin / ค่า SEED_ADMIN_PASSWORD ใน .env แล้วเปลี่ยนรหัสผ่าน)" "Green"
Start-Process "http://localhost:$port"
