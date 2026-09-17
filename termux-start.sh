#!/data/data/com.termux/files/usr/bin/bash
# termux-start.sh (v1.1 Update)
# Android Termux 1-Click Bootstrap and Global CLI Configurator

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "     Asriel-Proxy-Gemini : Termux Launcher v1.1    "
echo "==================================================="

# Ensure Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "[SETUP] Node.js not detected. Installing via Termux package manager..."
    pkg update -y
    pkg install nodejs -y
fi

# Auto-install the universal "asriel" CLI command if not already present
if [ ! -f "$PREFIX/bin/asriel" ]; then
    echo "[SETUP] Registering global case-insensitive CLI shortcut..."
    chmod +x "$SCRIPT_DIR/install-global.sh"
    "$SCRIPT_DIR/install-global.sh"
fi

# Detect phone's IP address on Wi-Fi
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "127.0.0.1")

echo "---------------------------------------------------"
echo " JanitorAI Endpoint on this phone:"
echo "   http://127.0.0.1:5000/v1"
echo ""
echo " Access from another device on same Wi-Fi:"
echo "   http://${LOCAL_IP}:5000/v1"
echo ""
echo " Global command active: Type 'asriel' (any case) anywhere!"
echo "---------------------------------------------------"

# Launch proxy
exec node "$SCRIPT_DIR/server.js"
