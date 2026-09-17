#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================="
echo "       Asriel-Proxy-Gemini - Unix / macOS Launcher     "
echo "======================================================="

PYTHON_BIN="python3"
if ! command -v "$PYTHON_BIN" &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_BIN="python"
    else
        echo "[ERROR] Python 3 is not installed or not in PATH."
        exit 1
    fi
fi

if [ ! -d "venv" ]; then
    echo "[*] Creating virtual environment in ./venv ..."
    "$PYTHON_BIN" -m venv venv
fi

echo "[*] Activating virtual environment..."
source venv/bin/activate

echo "[*] Verifying dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

if [ ! -f ".env" ]; then
    echo "[*] Generating default .env configuration..."
    cat <<EOF > .env
HOST=0.0.0.0
PORT=5000
GEMINI_API_KEYS=
DEFAULT_MODEL=gemini-2.5-flash
THINKING_BUDGET=5000
STRIP_XML_TAGS=True
STRIP_URLS=True
STRIP_THINKING_BLOCKS=True
EOF
    echo "[!] Created .env file. Add your API keys if needed."
fi

echo "======================================================="
echo " Proxy online: http://127.0.0.1:5000"
echo " JanitorAI URL: http://localhost:5000/v1"
echo "======================================================="

exec python main.py
