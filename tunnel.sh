#!/usr/bin/env bash
# tunnel.sh
# Creates a free, secure Cloudflare HTTPS tunnel for Asriel-Proxy-Gemini.

set -e

PORT=${PORT:-5000}
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

if ! command -v cloudflared >/dev/null 2>&1; then
    echo "[SETUP] cloudflared not found. Downloading static standalone binary..."
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" ;;
        aarch64|arm64) URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" ;;
        armv7l|armhf) URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm" ;;
        *) echo "[ERROR] Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    curl -fsSL "$URL" -o "$BIN_DIR/cloudflared"
    chmod +x "$BIN_DIR/cloudflared"
    export PATH="$BIN_DIR:$PATH"
fi

echo "==================================================="
echo "  Asriel-Proxy-Gemini : Cloudflare Remote Tunnel   "
echo "==================================================="
echo "[INFO] Connecting tunnel to http://localhost:${PORT}..."
echo "[INFO] Look for the 'https://...trycloudflare.com' address below."
echo "[INFO] In JanitorAI, set Proxy URL to: https://YOUR-TUNNEL-URL/v1"
echo "---------------------------------------------------"

exec cloudflared tunnel --url "http://localhost:${PORT}"
