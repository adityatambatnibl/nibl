@echo off
REM Switch the four backends to PRODUCTION settings on the server (IIS + NSSM).
REM Asks for the public address and a new database password, then checks everything.
REM Safe to run again. A copy of every .env is kept as .env.bak-<date>.
net session >nul 2>&1
if errorlevel 1 (
    echo Asking for Administrator permission...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-production.ps1"
echo.
pause
