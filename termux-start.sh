#!/data/data/com.termux/files/usr/bin/bash
# termux-start.sh - Termux 1-Click Bootstrap and Runner

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "  Asriel-Proxy-Gemini v2.0 : Android Termux Runner "
echo "==================================================="

if ! command -v node >/dev/null 2>&1; then
    echo "[SETUP] Node.js not detected. Installing via pkg..."
    pkg update -y
    pkg install nodejs -y
fi

if [ ! -f "$PREFIX/bin/asriel" ]; then
    echo "[SETUP] Registering universal 'asriel' command..."
    chmod +x "$SCRIPT_DIR/install-global.sh"
    "$SCRIPT_DIR/install-global.sh"
fi

LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' || echo "127.0.0.1")

echo "---------------------------------------------------"
echo " JanitorAI Reverse Proxy URL on this device:"
echo "   http://127.0.0.1:5000/v1"
echo ""
echo " If using browser on same Wi-Fi:"
echo "   http://${LOCAL_IP}:5000/v1"
echo ""
echo " Type 'asriel' from any folder to start anytime!"
echo "---------------------------------------------------"

exec node "$SCRIPT_DIR/server.js"
