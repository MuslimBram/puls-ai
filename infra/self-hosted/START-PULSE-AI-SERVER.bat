@echo off
setlocal
title Pulse AI - Self-Hosted Supabase Bootstrap
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-windows.ps1"
if errorlevel 1 (
  echo.
  echo R114 bootstrap FAILED. See the output above and the report file in pulse-local.
  pause
  exit /b 1
)
echo.
echo R114 bootstrap completed. Running certification...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0certify-windows.ps1"
if errorlevel 1 (
  echo.
  echo R114 certification FAILED or is incomplete. See pulse-local114-local-certification.txt
  pause
  exit /b 1
)
echo.
echo R114 LOCAL CERTIFICATION PASSED.
pause
