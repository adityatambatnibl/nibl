@echo off
REM Step 1 - read-only check of the server. Writes scripts\switch\server-check.txt and deploy-config.ps1
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch\check-server.ps1"
echo.
pause
