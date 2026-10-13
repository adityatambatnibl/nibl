@echo off
REM Starts the whole system for development: 4 backends + 4 frontends, each in its own window.
REM Then open http://localhost:5173  (the portal - it also serves /oipm, /npd, /ai-drawing-control).
REM
REM SAFE MODE (default): no e-mail leaves this PC and no reminders / daily summaries run,
REM because the local databases hold REAL colleagues' e-mail addresses.
REM These settings override the .env files only for the windows started here.
REM To test real e-mail once:  set NIBL_DEV_REAL_MAIL=1  then run START-DEV.bat from that window.
set ROOT=%~dp0..
if not "%NIBL_DEV_REAL_MAIL%"=="1" (
    set EMAIL_ENABLED=false
    set SCHEDULER_ENABLED=false
    set SMTP_HOST=127.0.0.1
    set SMTP_PORT=9
    echo SAFE MODE: e-mail and scheduled reminders are OFF for this run.
) else (
    echo REAL MAIL MODE: e-mails WILL be sent to real people.
)
start "Portal backend :8010"      cmd /k "%ROOT%\portal\backend\run-dev.bat"
start "OIPM backend :8000"        cmd /k "%ROOT%\applications\OIPM\backend\run-dev.bat"
start "NPD backend :8001"         cmd /k "%ROOT%\applications\NPD\backend\run-dev.bat"
start "AI Drawing backend :8002"  cmd /k "%ROOT%\applications\AI-Drawing-Control\backend\run-dev.bat"
start "OIPM frontend :5174"       cmd /k "%ROOT%\applications\OIPM\frontend\run-dev.bat"
start "NPD frontend :5175"        cmd /k "%ROOT%\applications\NPD\frontend\run-dev.bat"
start "AI Drawing frontend :5176" cmd /k "%ROOT%\applications\AI-Drawing-Control\frontend\run-dev.bat"
start "Portal frontend :5173"     cmd /k "%ROOT%\portal\frontend\run-dev.bat"
echo Started. Open http://localhost:5173 when the windows say "ready".
timeout /t 8 >nul
start http://localhost:5173
