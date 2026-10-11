@echo off
REM Rollback - old version back in about a minute.
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch\rollback.ps1"
echo.
pause
