@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Sound2World Server" /min py -m http.server 5173
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Sound2World needs Python 3 to start its local server.
    echo Install Python from https://www.python.org/downloads/ and try again.
    pause
    exit /b 1
  )
  start "Sound2World Server" /min python -m http.server 5173
)
timeout /t 1 /nobreak >nul
start "" http://localhost:5173
endlocal
