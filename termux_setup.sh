#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "======================================================="
echo "     Asriel-Proxy-Gemini - Termux Android Installer   "
echo "======================================================="

pkg update -y && pkg upgrade -y
pkg install -y python clang libffi openssl git

cd "$HOME"
if [ ! -d "Asriel-Proxy-Gemini" ]; then
    echo "[*] Working directory: $(pwd)/Asriel-Proxy-Gemini"
fi

if [ -f "requirements.txt" ]; then
    BASE_DIR="$(pwd)"
else
    cd Asriel-Proxy-Gemini
    BASE_DIR="$(pwd)"
fi

echo "[*] Setting up Python virtual environment..."
python -m venv venv
source venv/bin/activate

echo "[*] Installing dependencies with binary preference..."
pip install --upgrade pip setuptools wheel
pip install --prefer-binary -r requirements.txt

if [ ! -f ".env" ]; then
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
    echo "[!] Created .env file."
fi

echo "======================================================="
echo " Launching Asriel Proxy in Termux on 0.0.0.0:5000"
echo " Use http://127.0.0.1:5000/v1 inside Termux browser"
echo " Or your phone's LAN IP from another device"
echo "======================================================="

exec python main.py
