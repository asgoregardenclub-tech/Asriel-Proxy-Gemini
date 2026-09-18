#!/usr/bin/env bash
# Universal CLI shortcut installer for Termux, Linux, and macOS.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_NAME="asriel"

echo "==================================================="
echo "  Asriel-Proxy-Gemini Global CLI Installer         "
echo "==================================================="

if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    TARGET_BIN="$PREFIX/bin"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
    TERMUX_BASHRC="$PREFIX/etc/bash.bashrc"
elif [ "$(id -u)" -eq 0 ]; then
    TARGET_BIN="/usr/local/bin"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
else
    TARGET_BIN="$HOME/.local/bin"
    mkdir -p "$TARGET_BIN"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
fi

echo "[1/4] Target path: $TARGET_BIN"

WRAPPER_FILE="$TARGET_BIN/$WRAPPER_NAME"
cat <<EOF > "$WRAPPER_FILE"
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/server.js" "\$@"
EOF

chmod +x "$WRAPPER_FILE"
echo "[2/4] Created master executable: $WRAPPER_FILE"

for VARIANT in "Asriel" "ASRIEL"; do
    ln -sf "$WRAPPER_FILE" "$TARGET_BIN/$VARIANT"
done
echo "[3/4] Created casing symlinks (asriel, Asriel, ASRIEL)"

CASE_HOOK_BASH='
# >>> Asriel-Proxy-Gemini Case-Insensitive CLI Handler >>>
command_not_found_handle() {
    local cmd="$1"
    if [ "${cmd,,}" = "asriel" ]; then
        shift
        exec asriel "$@"
    fi
    if [ -x /data/data/com.termux/files/usr/libexec/termux/command-not-found ]; then
        /data/data/com.termux/files/usr/libexec/termux/command-not-found "$1"
        return $?
    elif [ -x /usr/lib/command-not-found ]; then
        /usr/lib/command-not-found -- "$1"
        return $?
    fi
    echo "$1: command not found" >&2
    return 127
}
# <<< Asriel-Proxy-Gemini Case-Insensitive CLI Handler <<<
'

CASE_HOOK_ZSH='
# >>> Asriel-Proxy-Gemini Case-Insensitive CLI Handler >>>
command_not_handler() {
    local cmd="$1"
    if [[ "${(L)cmd}" == "asriel" ]]; then
        shift
        exec asriel "$@"
    fi
    echo "zsh: command not found: $1" >&2
    return 127
}
# <<< Asriel-Proxy-Gemini Case-Insensitive CLI Handler <<<
'

for RC in "$BASHRC_FILE" "$TERMUX_BASHRC"; do
    if [ -f "$RC" ] || [ "$RC" = "$BASHRC_FILE" ]; then
        touch "$RC"
        if ! grep -q "Asriel-Proxy-Gemini Case-Insensitive CLI Handler" "$RC"; then
            echo "$CASE_HOOK_BASH" >> "$RC"
        fi
    fi
done

if [ -f "$ZSHRC_FILE" ] || [ -n "$ZSH_VERSION" ]; then
    touch "$ZSHRC_FILE"
    if ! grep -q "Asriel-Proxy-Gemini Case-Insensitive CLI Handler" "$ZSHRC_FILE"; then
        echo "$CASE_HOOK_ZSH" >> "$ZSHRC_FILE"
    fi
fi

echo "[4/4] CLI shortcut handler ready."
echo "==================================================="
echo " Installed! Run 'asriel' from any directory."
echo "==================================================="
