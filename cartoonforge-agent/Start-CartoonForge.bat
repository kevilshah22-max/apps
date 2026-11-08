@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required. Install it from https://www.python.org/downloads/ and enable Add Python to PATH.
  pause
  exit /b 1
)
start "" http://127.0.0.1:8765
py -3 "%~dp0studio_server.py"
pause
