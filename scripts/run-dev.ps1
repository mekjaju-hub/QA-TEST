# WebQA2026 - run without Docker (SQLite + inline background jobs + local test runner)
# Double-click RUN-DEV.bat. Stop with STOP-DEV.bat.
# Data: storage\webqa.sqlite3 + files in storage\  (kept between runs)
# Logs: storage\logs\  (send them to Claude if something fails)
param([switch]$Rebuild)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logs = "$root\storage\logs"; New-Item -ItemType Directory -Force -Path $logs | Out-Null
$runDir = "$root\storage\run"; New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$log = "$logs\run-dev_$(Get-Date -Format yyyyMMdd_HHmmss).log"
function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c; Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m) -Encoding UTF8 }
function Fail($m) { Say $m "Red"; Say "log: $log" "Yellow"; exit 1 }
function Run($title, [scriptblock]$cmd) {
  Say $title "Cyan"
  $out = & $cmd 2>&1
  $code = $LASTEXITCODE
  Add-Content -Path $log -Value ($out | Out-String) -Encoding UTF8
  if ($code -ne 0) { $out | Select-Object -Last 25 | Out-Host; Fail "$title - ไม่สำเร็จ (exit $code)" }
}
function Listening($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Up($url) { try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 } catch { $false } }

$API_PORT = 8000; $WEB_PORT = 3000
Say "== WebQA2026 (ไม่ใช้ Docker / SQLite) ==" "Cyan"

# Already running?
if ((Up "http://127.0.0.1:$WEB_PORT/login") -and (Up "http://127.0.0.1:$WEB_PORT/api/health")) {
  Say "ระบบรันอยู่แล้ว - เปิดเบราว์เซอร์ให้" "Green"; Start-Process "http://127.0.0.1:$WEB_PORT"; exit 0
}
foreach ($p in @($API_PORT, $WEB_PORT)) { if (Listening $p) { Fail "Port $p ถูกโปรแกรมอื่นใช้อยู่ - ปิดโปรแกรมนั้น หรือรัน STOP-DEV.bat ก่อน" } }

# 1) Python 3.11 / 3.12
$py = $null
foreach ($cand in @("py -3.12", "py -3.11", "python")) {
  $parts = $cand.Split(" "); $exe = $parts[0]; $args0 = @($parts | Select-Object -Skip 1)
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
  $v = & $exe @args0 -c "import sys;print('%d.%d'%sys.version_info[:2])" 2>$null
  if ($LASTEXITCODE -eq 0 -and ($v -eq "3.11" -or $v -eq "3.12")) { $py = @($exe) + $args0; Say "Python $v" "Green"; break }
}
if (-not $py) { Fail "ไม่พบ Python 3.11 หรือ 3.12 - ติดตั้งจาก https://www.python.org/downloads/ (ติ๊ก 'Add python.exe to PATH') แล้วลองใหม่" }

# 2) Node.js 20+
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "ไม่พบ Node.js - ติดตั้ง LTS จาก https://nodejs.org/ แล้วลองใหม่" }
$nv = (node -v) -replace "^v", ""; if ([int]($nv.Split(".")[0]) -lt 20) { Fail "Node.js $nv เก่าเกินไป - ต้องการ 20 ขึ้นไป (https://nodejs.org/)" }
Say "Node.js $nv" "Green"

# 3) Python venv + packages
$venvPy = "$root\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
  $pyExe = $py[0]; $pyArgs = @($py | Select-Object -Skip 1) + @("-m", "venv", "$root\.venv")
  Run "สร้าง Python venv (.venv)" { & $pyExe @pyArgs }
}
$reqFiles = @("$root\backend\requirements.txt", "$root\automation-runner\requirements.txt")
$reqHash = (($reqFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }) -join "")
$stamp = "$root\.venv\.webqa-req"
if (-not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $reqHash) {
  Run "อัปเกรด pip" { & $venvPy -m pip install --upgrade pip --disable-pip-version-check -q }
  Run "ติดตั้ง Python packages (ครั้งแรกใช้เวลาสักครู่)" { & $venvPy -m pip install --disable-pip-version-check -q -r $reqFiles[0] -r $reqFiles[1] }
  Set-Content -Path $stamp -Value $reqHash
} else { Say "Python packages พร้อมแล้ว" "Green" }

# 3b) Chromium for Web Explorer (Playwright) - once per Playwright version
$pwStamp = "$root\.venv\.webqa-chromium"
$pwVer = (& $venvPy -c "import importlib.metadata as m;print(m.version('playwright'))" 2>$null)
if ($pwVer -and (-not (Test-Path $pwStamp) -or (Get-Content $pwStamp -Raw).Trim() -ne $pwVer)) {
  Run "ติดตั้ง Chromium สำหรับ Web Explorer (ครั้งแรก ~150 MB)" { & $venvPy -m playwright install chromium }
  Set-Content -Path $pwStamp -Value $pwVer
}

# 4) Frontend packages + production build
Push-Location "$root\frontend"
$lockHash = (Get-FileHash "package-lock.json" -Algorithm SHA256).Hash
$nstamp = "node_modules\.webqa-lock"
if (-not (Test-Path $nstamp) -or (Get-Content $nstamp -Raw).Trim() -ne $lockHash) {
  Run "ติดตั้ง Frontend packages (npm ci - ครั้งแรกใช้เวลาสักครู่)" { npm ci --no-audit --no-fund }
  Set-Content -Path $nstamp -Value $lockHash; $Rebuild = $true
} else { Say "Frontend packages พร้อมแล้ว" "Green" }
# rebuild automatically when frontend source files changed since the last build
$srcSig = (Get-ChildItem -Recurse -File -Path app, components, lib, public\*.* -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\public\\monaco\\" } | Sort-Object FullName |
  ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join "`n"
$srcHash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($srcSig))) -replace "-", ""
$bstamp = ".next\.webqa-src"
if ($Rebuild -or -not (Test-Path ".next\BUILD_ID") -or -not (Test-Path $bstamp) -or (Get-Content $bstamp -Raw).Trim() -ne $srcHash) {
  Run "Build หน้าเว็บ (npm run build)" { npm run build }
  Set-Content -Path $bstamp -Value $srcHash
} else { Say "ใช้ build เดิม (โค้ดหน้าเว็บไม่ได้เปลี่ยน)" "Green" }
Pop-Location

# 5) Environment for no-Docker mode (overrides .env)
$dbFile = ("$root\storage\webqa.sqlite3" -replace "\\", "/")
$env:DATABASE_URL = "sqlite:///$dbFile"
$env:TASK_MODE = "inline"
$env:RUNNER_URL = ""
$env:BIND_HOST = "127.0.0.1"
$env:STORAGE_ROOT = "$root\storage"
$env:PYTHONUTF8 = "1"
$env:BACKEND_INTERNAL_URL = "http://127.0.0.1:$API_PORT"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:LOGIN_RATE_PER_MINUTE = "30"   # Web Explorer อาจ Login ระบบนี้เองหลายครั้งตอนรัน Test
$env:SINGLE_USER_MODE = "true"   # ใช้คนเดียว: admin ทำได้ทุกอย่าง ไม่บังคับเปลี่ยนรหัสผ่าน ปิดบัญชี demo

# 6) Database migrate + seed (safe to repeat)
Push-Location "$root\backend"
Run "อัปเดตโครงสร้างฐานข้อมูล SQLite (alembic)" { & $venvPy -m alembic upgrade head }
Run "Seed ผู้ใช้เริ่มต้น + Project ตัวอย่าง" { & $venvPy -m app.seed }
Pop-Location

# 7) Start backend + frontend in background
$be = Start-Process -FilePath $venvPy -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$API_PORT") `
  -WorkingDirectory "$root\backend" -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$logs\backend.out.log" -RedirectStandardError "$logs\backend.err.log"
$fe = Start-Process -FilePath "node" -ArgumentList @("node_modules\next\dist\bin\next", "start", "-p", "$WEB_PORT", "-H", "127.0.0.1") `
  -WorkingDirectory "$root\frontend" -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$logs\frontend.out.log" -RedirectStandardError "$logs\frontend.err.log"
Set-Content -Path "$runDir\dev.pids" -Value @($be.Id, $fe.Id)
Say "เริ่ม backend (PID $($be.Id)) และ frontend (PID $($fe.Id))" "Cyan"

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep 2
  if ($be.HasExited) { Get-Content "$logs\backend.err.log" -Tail 30 | Out-Host; Fail "backend หยุดทำงาน - ดู storage\logs\backend.err.log" }
  if ($fe.HasExited) { Get-Content "$logs\frontend.err.log" -Tail 30 | Out-Host; Fail "frontend หยุดทำงาน - ดู storage\logs\frontend.err.log" }
  if ((Up "http://127.0.0.1:$WEB_PORT/login") -and (Up "http://127.0.0.1:$WEB_PORT/api/health")) { $ready = $true; break }
}
if (-not $ready) { Fail "ระบบยังไม่ตอบภายใน 2 นาที - ดู storage\logs\" }

Say "พร้อมใช้งาน: http://127.0.0.1:$WEB_PORT" "Green"
Say "Login: admin / รหัสผ่านของคุณ (ถ้ายังไม่เคยเปลี่ยน = Admin@12345)" "Green"
Say "ข้อมูลเก็บที่ storage\webqa.sqlite3 · ปิดระบบด้วย STOP-DEV.bat" "Green"
Start-Process "http://127.0.0.1:$WEB_PORT"
