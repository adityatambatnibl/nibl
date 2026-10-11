@echo off
REM One-time setup: databases (copied, nothing deleted), .env files, Python environments.
REM Needs Administrator only if the postgres password must be reset. Safe to run again.
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
pause
