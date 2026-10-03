@echo off
setlocal
rem ===== WebQA2026 - Website Test Suite (Test Cases: docs\qa\WEBQA2026_TEST_CASES.xlsx) =====
cd /d "%~dp0"
set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
set "PYTHON=%PY%"

:menu
echo.
echo  WebQA2026 - Website tests
echo  ------------------------------------------------------------
echo   1. Run ALL website E2E + API tests (Playwright, about 5 min)
echo   2. Run one module (e.g. 07-web-recorder, 08-web-history)
echo   3. Open the last E2E HTML report
echo   4. Load test   (50 users, 30 s)
echo   5. Stress test (10 -> 400 users, find breaking point)
echo   6. Spike test  (5 -> 300 -> 5 users)
echo   7. Rate-limit check (login 5/min, API 600/min)
echo   8. Rebuild the Test Case Excel from the last run
echo   9. First time only: install Playwright Chromium + build web
echo   0. Exit
echo  ------------------------------------------------------------
set /p c="Choose: "
if "%c%"=="1" goto all
if "%c%"=="2" goto one
if "%c%"=="3" goto report
if "%c%"=="4" goto load
if "%c%"=="5" goto stress
if "%c%"=="6" goto spike
if "%c%"=="7" goto rate
if "%c%"=="8" goto excel
if "%c%"=="9" goto setup
if "%c%"=="0" exit /b 0
goto menu

:all
pushd frontend
call npx playwright test -c playwright.website.config.ts
popd
call "%PY%" docs\qa\build_catalog.py
goto menu

:one
set /p m="Spec name or test ID (e.g. 07-web-recorder or WQA-HIS-03): "
pushd frontend
echo %m% | findstr /b "WQA-" >nul && (call npx playwright test -c playwright.website.config.ts --grep "%m%") || (call npx playwright test -c playwright.website.config.ts %m%)
popd
goto menu

:report
pushd frontend
call npx playwright show-report ..\storage\e2e-website\report
popd
goto menu

:askpw
echo Backend must be running (RUN-DEV.bat). Use a TEST account password.
set /p WEBQA_PASSWORD="Password of admin: "
exit /b 0

:load
call :askpw
call "%PY%" perf\webqa_perf.py --mode load --users 50 --duration 30
goto menu

:stress
call :askpw
call "%PY%" perf\webqa_perf.py --mode stress --levels 10,25,50,100,200,400 --step 15
goto menu

:spike
call :askpw
call "%PY%" perf\webqa_perf.py --mode spike --users 300
goto menu

:rate
call :askpw
call "%PY%" perf\webqa_perf.py --mode ratelimit
goto menu

:excel
call "%PY%" docs\qa\build_catalog.py
start "" "docs\qa\WEBQA2026_TEST_CASES.xlsx"
goto menu

:setup
pushd frontend
call npx playwright install chromium
call npx next build
popd
goto menu
