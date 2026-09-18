@echo off
TITLE Asriel-Proxy-Gemini v2.0 (Windows)
SETLOCAL EnableDelayedExpansion

echo ===================================================
echo     Starting Asriel-Proxy-Gemini v2.0 (Windows)    
echo ===================================================

where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

IF NOT EXIST "%~dp0asriel.cmd" (
    echo @echo off > "%~dp0asriel.cmd"
    echo node "%%~dp0server.js" %%* >> "%~dp0asriel.cmd"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = '%~dp0'.TrimEnd('\'); " ^
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); " ^
    "if ($userPath -notlike \"*$dir*\") { " ^
    "    [Environment]::SetEnvironmentVariable('Path', \"$userPath;$dir\", 'User'); " ^
    "    Write-Host '[INFO] Added Asriel directory to User PATH.'; " ^
    "}"

echo [INFO] Initializing server on http://localhost:5000/v1 ...
node "%~dp0server.js"

IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Server terminated unexpectedly.
    pause
)
