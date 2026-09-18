#!/usr/bin/env bash
# start_unix.sh - macOS and Linux Runner

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "  Starting Asriel-Proxy-Gemini v2.0 (macOS/Linux)   "
echo "==================================================="

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    exit 1
fi

exec node "$SCRIPT_DIR/server.js"
