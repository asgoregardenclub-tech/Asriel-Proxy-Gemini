#!/data/data/com.termux/files/usr/bin/bash
# termux-start.sh - Android Termux 1-Click Bootstrap and Runner
# Zero compilation required (Pure JS / Userland only)

set -e

echo "==================================================="
echo "     Asriel-Proxy-Gemini : Android Termux Runner   "
echo "==================================================="

# Check if nodejs is installed in Termux
if ! command -v node >/dev/null 2>&1; then
    echo "[SETUP] Node.js not detected. Installing via Termux package manager..."
    pkg update -y
    pkg install nodejs -y
fi

echo "[INFO] Node environment: $(node -v)"

# Identify local WLAN IP for easy JanitorAI phone setup
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "127.0.0.1")

echo "---------------------------------------------------"
echo "Proxy Endpoint for JanitorAI on this device:"
echo "  http://127.0.0.1:5000/v1"
echo ""
echo "If accessing from another device on the same Wi-Fi:"
echo "  http://${LOCAL_IP}:5000/v1"
echo "---------------------------------------------------"

# Ensure execution permissions for other scripts
chmod +x start_unix.sh 2>/dev/null || true

# Start the server directly
exec node server.js
