@echo off
chcp 65001 >nul
cd /d "%~dp0frontend"

REM Sunucu zaten calisiyorsa (3000 portu dinlemede) tekrar baslatma, sadece tarayiciyi ac
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 goto OPEN

start "AIRON Web Sunucusu" cmd /k "npm run dev"

:WAIT
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not %errorlevel%==0 goto WAIT

:OPEN
start "" "http://localhost:3000"
