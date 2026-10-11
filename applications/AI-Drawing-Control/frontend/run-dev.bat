@echo off
REM AI Drawing Control frontend - development server on port 5176.
cd /d "%~dp0"
where npm >nul 2>&1 || (echo Node.js is not installed - get the LTS version from https://nodejs.org & pause & exit /b 1)
if not exist "node_modules" ( echo First run - installing packages... & call npm install )
title AI Drawing Control frontend :5176
call npm run dev
pause
