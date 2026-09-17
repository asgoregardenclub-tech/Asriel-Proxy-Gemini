@echo off
TITLE Asriel-Proxy-Gemini Launcher (v1.1)
SETLOCAL EnableDelayedExpansion

echo ===================================================
echo     Starting Asriel-Proxy-Gemini (Windows v1.1)    
echo ===================================================

:: Check if Node.js is installed
where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js v26.x or the latest LTS from https://nodejs.org/
    pause
    exit /b 1
)

:: Ensure asriel.cmd exists in the current folder for PATH execution
IF NOT EXIST "%~dp0asriel.cmd" (
    echo @echo off > "%~dp0asriel.cmd"
    echo node "%%~dp0server.js" %%* >> "%~dp0asriel.cmd"
)

:: Register the script directory to the User PATH if not already present
echo [SETUP] Verifying Windows CLI command registration...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dir = '%~dp0'.TrimEnd('\'); " ^
    "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); " ^
    "if ($userPath -notlike \"*$dir*\") { " ^
    "    [Environment]::SetEnvironmentVariable('Path', \"$userPath;$dir\", 'User'); " ^
    "    Write-Host '[INFO] Successfully registered directory to User PATH.'; " ^
    "    Write-Host '[INFO] You can now open any new CMD/PowerShell window and type: asriel, Asriel, or ASRIEL.'; " ^
    "} else { " ^
    "    Write-Host '[INFO] Global command already configured.'; " ^
    "}"

echo [INFO] Initializing server on http://localhost:5000/v1 ...
node "%~dp0server.js"

IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] The proxy server crashed or terminated with an error.
    pause
)
