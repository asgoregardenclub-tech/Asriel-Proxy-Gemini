@echo off
TITLE Asriel-Proxy-Gemini Launcher
SETLOCAL EnableDelayedExpansion

echo ===================================================
echo       Starting Asriel-Proxy-Gemini (Windows)       
echo ===================================================

:: Check if Node.js is installed
where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js v26.x or the latest LTS from https://nodejs.org/
    pause
    exit /b 1
)

:: Confirm Node.js version
node -v

:: Launch the ESM Server
echo [INFO] Initializing server on http://localhost:5000/v1 ...
node server.js

IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] The proxy server crashed or terminated with an error.
    pause
)
