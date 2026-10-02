# Stops the backend + frontend started by RUN-DEV.bat. Data in storage\ is kept.
$root = Split-Path -Parent $PSScriptRoot
$pidFile = "$root\storage\run\dev.pids"
$stopped = 0
if (Test-Path $pidFile) {
  foreach ($id in Get-Content $pidFile) {
    if ($id -match "^\d+$") {
      $p = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($p) { & taskkill /PID $id /T /F *> $null; $stopped++ }
    }
  }
  Remove-Item $pidFile -Force
}
# Fallback: anything still listening on the two ports
foreach ($port in 8000, 3000) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and ($p.ProcessName -in @("python", "node"))) { & taskkill /PID $p.Id /T /F *> $null; $stopped++ }
  }
}
Write-Host "ปิดระบบแล้ว ($stopped process) - ข้อมูลยังอยู่ใน storage\" -ForegroundColor Green
