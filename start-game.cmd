@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0..\tools\node\node.exe" set "PATH=%~dp0..\tools\node;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or newer is required. See README.md.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. See the message above.
    pause
    exit /b 1
  )
)
echo Starting LUMEN DUEL. Keep this window open while playing.
echo To stop, press Ctrl+C or close this window.
call npm run dev -- --open
if errorlevel 1 pause
