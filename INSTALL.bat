@echo off
cd /d "%~dp0"
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Install failed.
  pause
  exit /b 1
)
call npm run build
pause
