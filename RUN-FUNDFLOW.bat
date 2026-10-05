@echo off
chcp 65001 >nul
REM เปิด FundFlow API (Express) ที่พอร์ต 3100 ให้เมนู FundFlow ใน WebQA2026 เรียกผ่าน /ff-api
set PORT=3100
cd /d "%~dp0..\fundflow-qa"
if not exist node_modules ( echo ติดตั้ง dependencies... & call npm install )
echo FundFlow API: http://localhost:3100  (customer: demo / OTP 123456)
node src\server.js
pause
