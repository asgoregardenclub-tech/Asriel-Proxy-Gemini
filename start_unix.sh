#!/usr/bin/env bash
# start_unix.sh - Native macOS & Linux Launcher

set -e

echo "==================================================="
echo "       Starting Asriel-Proxy-Gemini (Unix)         "
echo "==================================================="

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo "Please install Node.js v26.x or newer from https://nodejs.org/ or via your package manager."
    exit 1
fi

echo "[INFO] Running on Node: $(node -v)"
echo "[INFO] Starting server on http://localhost:5000/v1 ..."

# Launch Node server
exec node server.js
