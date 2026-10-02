@echo off
setlocal
title Pulse AI - R114 Local Certification
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0certify-windows.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
if "%EXITCODE%"=="0" (
  echo R114 LOCAL CERTIFICATION: PASS
) else (
  echo R114 LOCAL CERTIFICATION: INCOMPLETE - see pulse-local114-local-certification.txt
)
pause
exit /b %EXITCODE%
