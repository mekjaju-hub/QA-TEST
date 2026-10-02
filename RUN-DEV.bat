@echo off
chcp 65001 >nul
cd /d "%~dp0"
if /I "%~1"=="rebuild" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-dev.ps1" -Rebuild
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-dev.ps1"
)
echo.
pause
