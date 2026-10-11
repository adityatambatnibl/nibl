@echo off
REM NIBL Portal backend - development (auto-reload). First run creates venv and installs packages.
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo First run - creating Python environment...
    python -m venv venv || (echo Python 3.12+ is not installed. & pause & exit /b 1)
    venv\Scripts\python.exe -m pip install --upgrade pip
    venv\Scripts\python.exe -m pip install -r requirements.txt
)
if not exist ".env" (
    echo .env is missing here. Run scripts\SETUP.bat first.
    pause & exit /b 1
)
title NIBL Portal backend :8010
venv\Scripts\python.exe -m uvicorn app.main:app --reload --reload-exclude venv --host 127.0.0.1 --port 8010
pause
