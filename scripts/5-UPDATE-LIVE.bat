@echo off
REM After go-live: get the newest version from GitHub and put it live (backup first, ~1 min downtime).
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch\update-live.ps1"
echo.
pause
