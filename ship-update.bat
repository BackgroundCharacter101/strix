@echo off
REM Build + publish a new Strix M1 update — double-click after you make changes.
REM Builds the installer and writes it to the update feed (dist-updates\).
REM The app detects it via version OR git build-id, so no version bump needed.
REM (Run update-server.bat separately and keep it open for the app to fetch it.)

cd /d "%~dp0"
title Strix — Ship Update

echo ============================================================
echo   Building + publishing an M1 update...
echo ============================================================
echo.

call npm run update:ship
if errorlevel 1 (
  echo.
  echo Build/publish FAILED — see the errors above.
  pause
  exit /b 1
)

echo.
echo Done. If update-server.bat is running, open the app and
echo choose Help ^> Check for Updates.
pause
