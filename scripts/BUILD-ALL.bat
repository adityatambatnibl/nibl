@echo off
REM Production build of the four frontends. Output: <project>\frontend\dist
set ROOT=%~dp0..
for %%P in ("portal" "applications\OIPM" "applications\NPD" "applications\AI-Drawing-Control") do (
    echo === Building %%~P ===
    pushd "%ROOT%\%%~P\frontend"
    if not exist node_modules call npm ci
    call npm run build || (echo BUILD FAILED in %%~P & popd & pause & exit /b 1)
    popd
)
echo All four frontends built.
pause
