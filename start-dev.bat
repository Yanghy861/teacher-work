@echo off
setlocal
cd /d "%~dp0"
title Teacher Workbench - Development

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found.
  echo Install Node.js or add npm to PATH, then try again.
  echo.
  pause
  exit /b 1
)

echo Starting Teacher Workbench development mode...
echo Keep this window open while using the app.
echo Close the app window or press Ctrl+C here to stop it.
echo.

call npm.cmd run dev
set "DEV_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%DEV_EXIT_CODE%"=="0" (
  echo [ERROR] Development mode exited with code %DEV_EXIT_CODE%.
) else (
  echo Development mode has stopped.
)
echo Copy any error text above if the app did not open.
pause
exit /b %DEV_EXIT_CODE%
