@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   Claude Context Viewer
echo ========================================
echo.

cd /d "%~dp0"

set PORT=3033

REM Check if port is in use
echo Checking port %PORT%...
for /f "tokens=1,2" %%a in ('powershell -ExecutionPolicy Bypass -File "%~dp0check-port.ps1"') do (
    set "RESULT_TYPE=%%a"
    set "RESULT_PID=%%b"
)

if "!RESULT_TYPE!"=="FOUND_SERVER" (
    echo Found existing server.js process ^(PID: !RESULT_PID!^), stopping it...
    taskkill /F /PID !RESULT_PID! >nul 2>&1
    echo Waiting for port to be released...
    timeout /t 2 /nobreak >nul

    REM Double check
    for /f "tokens=1" %%x in ('powershell -ExecutionPolicy Bypass -File "%~dp0check-port.ps1"') do (
        set "RECHECK=%%x"
    )
    if "!RECHECK!"=="FOUND_SERVER" (
        echo Warning: Port %PORT% is still in use
        pause
        exit /b 1
    )
)

if "!RESULT_TYPE!"=="OTHER_PROCESS" (
    echo Port %PORT% is used by another process ^(PID: !RESULT_PID!^)
    echo Cannot automatically stop this process.
    echo.
    echo Please manually stop the process or choose a different port.
    pause
    exit /b 1
)

echo Port %PORT% is available
echo.

REM Start server
echo ========================================
echo   Starting Server...
echo ========================================
echo.
echo   URL: http://localhost:%PORT%
echo.
echo   Press Ctrl+C to stop
echo ========================================
echo.

REM Start server in background
start /b node server.js

REM Wait for server to start
echo Waiting for server to start...
timeout /t 3 /nobreak >nul

REM Open Chrome browser
echo Opening browser...
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if exist "%CHROME_PATH%" (
    start "" "%CHROME_PATH%" http://localhost:%PORT%
) else (
    REM Chrome not found, use default browser
    start http://localhost:%PORT%
)

echo.
echo Server is running. Press Ctrl+C to stop.
pause
