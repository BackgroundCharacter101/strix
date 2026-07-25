@echo off
REM Strix update feed server — double-click to run.
REM Keep this window OPEN: the installed app's Help > Check for Updates talks to
REM this server (http://localhost:8787). Closing the window stops updates.

cd /d "%~dp0"
title Strix Update Server (localhost:8787)

echo ============================================================
echo   Strix Update Feed
echo ============================================================

REM Free port 8787 if a previous server is still holding it.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr LISTENING') do (
  echo Stopping old server on port 8787 (pid %%p)...
  taskkill /f /pid %%p >nul 2>&1
)

echo Starting the update feed on http://localhost:8787
echo Leave this window open. Press Ctrl+C or close it to stop.
echo.

call npm run update:serve

echo.
echo Server stopped.
pause
