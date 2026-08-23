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

if not exist "%~dp0node_modules\.bin\electron-vite.cmd" (
  echo Required project dependencies are missing or incomplete.
  echo Installing dependencies automatically. This may take a few minutes...
  echo.

  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    echo Check the network connection, then run this file again.
    pause
    exit /b 1
  )

  if not exist "%~dp0node_modules\.bin\electron-vite.cmd" (
    echo.
    echo [ERROR] electron-vite is still missing after dependency installation.
    echo Copy the error text above for troubleshooting.
    pause
    exit /b 1
  )

  echo.
  echo Dependencies installed successfully.
  echo.
)

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo The Electron runtime is missing or incomplete.
  echo Downloading and repairing Electron. This may take a few minutes...
  echo.

  node "%~dp0node_modules\electron\install.js"
  if errorlevel 1 (
    echo.
    echo [ERROR] Electron installation failed.
    echo Check the network connection, then run this file again.
    pause
    exit /b 1
  )

  if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo.
    echo [ERROR] electron.exe is still missing after installation.
    echo Copy the error text above for troubleshooting.
    pause
    exit /b 1
  )

  echo.
  echo Electron installed successfully.
  echo.
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
