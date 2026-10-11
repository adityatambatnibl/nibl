@echo off
REM NPD backend - production: no reload, ONE worker (scheduled jobs expect a single process).
REM Installed as a Windows service by scripts\install-services.ps1 (NSSM).
REM APP_PORT is set by NSSM only for the side-by-side test (scripts\switch). Default = live port.
cd /d "%~dp0"
if not defined APP_PORT set APP_PORT=8001
venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port %APP_PORT% --workers 1 --proxy-headers
