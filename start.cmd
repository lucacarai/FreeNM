@echo off
setlocal
cd /d "%~dp0"
node scripts/build.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4175/ in your browser.
node server.mjs
if errorlevel 1 pause
