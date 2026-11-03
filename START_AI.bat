@echo off
cd /d "%~dp0"
node server/bootstrap.mjs
if errorlevel 1 (
  echo Could not create or read local config.
  pause
  exit /b 1
)
call npm run ai
pause
