@echo off
REM Checks that the four services, IIS and the screens answer. Run after every deploy.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0smoke-test.ps1" %*
echo.
pause
