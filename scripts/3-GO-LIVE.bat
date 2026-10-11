@echo off
REM Step 3 - switch users to the new version (few minutes downtime, offers rollback on failure).
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch\go-live.ps1"
echo.
pause
