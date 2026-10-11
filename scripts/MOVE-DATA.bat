@echo off
REM One-time: copy every application's files into applications\<app>\data and point the settings there.
REM Stop the backend windows first. Nothing is deleted.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0move-data.ps1" %*
echo.
pause
