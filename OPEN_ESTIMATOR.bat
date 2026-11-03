@echo off
cd /d "%~dp0"
if not exist node_modules\.bin\vite.cmd (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
echo Opening local PBC estimator at http://127.0.0.1:5173
call npm run dev
pause
