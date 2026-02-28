@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo   Testing Start Script Logic
echo ========================================
echo.

cd /d "%~dp0"

set PORT=3033

REM Check if port is in use
echo [1] Checking port %PORT%...
for /f "tokens=1,2" %%a in ('powershell -ExecutionPolicy Bypass -File "%~dp0check-port.ps1"') do (
    set "RESULT_TYPE=%%a"
    set "RESULT_PID=%%b"
)
echo Result: !RESULT_TYPE! !RESULT_PID!

if "!RESULT_TYPE!"=="FOUND_SERVER" (
    echo [2] Found existing server.js process ^(PID: !RESULT_PID!^), stopping it...
    taskkill /F /PID !RESULT_PID! >nul 2>&1
    echo Waiting for port to be released...
    timeout /t 2 /nobreak >nul

    REM Double check
    for /f "tokens=1" %%x in ('powershell -ExecutionPolicy Bypass -File "%~dp0check-port.ps1"') do (
        set "RECHECK=%%x"
    )
    if "!RECHECK!"=="FOUND_SERVER" (
        echo [ERROR] Port %PORT% is still in use
        pause
        exit /b 1
    )
    echo [3] Server stopped successfully
)

if "!RESULT_TYPE!"=="OTHER_PROCESS" (
    echo [ERROR] Port %PORT% is used by another process ^(PID: !RESULT_PID!^)
    pause
    exit /b 1
)

if "!RESULT_TYPE!"=="PORT_FREE" (
    echo [2] Port is already free
)

echo [4] Port %PORT% is available
echo.
echo ========================================
echo   Test PASSED!
echo ========================================
