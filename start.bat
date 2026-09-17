@echo off
setlocal enabledelayedexpansion
title Asriel-Proxy-Gemini

cd /d "%~dp0"

echo =======================================================
echo          Asriel-Proxy-Gemini - Windows Launcher
echo =======================================================

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH!
    echo Please install Python 3.11 or newer from https://www.python.org/
    pause
    exit /b 1
)

if not exist "venv" (
    echo [*] Initializing virtual environment in .\venv ...
    python -m venv venv
)

echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

echo [*] Checking dependencies...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

if not exist ".env" (
    echo [*] Generating default .env template...
    (
        echo HOST=0.0.0.0
        echo PORT=5000
        echo GEMINI_API_KEYS=
        echo DEFAULT_MODEL=gemini-2.5-flash
        echo THINKING_BUDGET=5000
        echo STRIP_XML_TAGS=True
        echo STRIP_URLS=True
        echo STRIP_THINKING_BLOCKS=True
    ) > .env
    echo [!] Created .env file. Please paste your Gemini API keys into .env if needed.
)

echo =======================================================
echo Starting Asriel Proxy on http://127.0.0.1:5000
echo Endpoint for JanitorAI: http://localhost:5000/v1
echo =======================================================
python main.py

pause
