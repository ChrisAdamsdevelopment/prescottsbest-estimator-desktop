@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo ERROR: Node.js is not installed. Please install Node.js 22 LTS from https://nodejs.org/
 pause
 exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
 echo ERROR: npm was not found. Reinstall Node.js 22 LTS.
 pause
 exit /b 1
)
for /f "delims=" %%v in ('node -p "Number(process.versions.node.split('.')[0]) >= 20"') do set NODE_OK=%%v
if not "%NODE_OK%"=="true" (
 echo ERROR: Please upgrade to Node.js 20 or newer. Node 22 LTS recommended.
 pause
 exit /b 1
)
echo Installing vetted dependencies from package-lock.json...
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
echo Checking production build...
call npm run build
if errorlevel 1 goto fail
echo Running local synthetic tests...
call npm test
if errorlevel 1 goto fail
echo.
echo SUCCESS. Next double-click START_AI.bat and then OPEN_ESTIMATOR.bat.
echo You will have an independent private local data store.
pause
exit /b 0
:fail
echo.
echo Setup did not complete. Review the error above; do not enter API keys into this console.
pause
exit /b 1
