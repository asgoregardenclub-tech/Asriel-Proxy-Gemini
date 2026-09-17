#!/usr/bin/env bash
# install-global.sh
# Universal Case-Insensitive CLI Shortcut Installer for Termux, Linux, and macOS.
# Enables launching the proxy anywhere by typing "asriel", "Asriel", "ASRIEL", "aSriel", etc.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_NAME="asriel"

echo "==================================================="
echo "  Asriel-Proxy-Gemini Global CLI Installer         "
echo "==================================================="

# 1. Determine target binary directory
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    # Android Termux environment
    TARGET_BIN="$PREFIX/bin"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
    TERMUX_BASHRC="$PREFIX/etc/bash.bashrc"
elif [ "$(id -u)" -eq 0 ]; then
    # Standard Root/Sudo Linux or macOS
    TARGET_BIN="/usr/local/bin"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
else
    # Userland without root
    TARGET_BIN="$HOME/.local/bin"
    mkdir -p "$TARGET_BIN"
    BASHRC_FILE="$HOME/.bashrc"
    ZSHRC_FILE="$HOME/.zshrc"
fi

echo "[1/4] Target binary path: $TARGET_BIN"

# 2. Generate the primary executable wrapper
WRAPPER_FILE="$TARGET_BIN/$WRAPPER_NAME"
cat <<EOF > "$WRAPPER_FILE"
#!/usr/bin/env bash
exec node "$SCRIPT_DIR/server.js" "\$@"
EOF

chmod +x "$WRAPPER_FILE"
echo "[2/4] Created master executable wrapper: $WRAPPER_FILE"

# 3. Create case-variant symlinks
for VARIANT in "Asriel" "ASRIEL"; do
    ln -sf "$WRAPPER_FILE" "$TARGET_BIN/$VARIANT"
done
echo "[3/4] Created symlink aliases (asriel, Asriel, ASRIEL)"

# 4. Inject universal case-insensitivity hook into shell configurations
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
command_not_found_handler() {
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

# Append to bashrc if present
for RC in "$BASHRC_FILE" "$TERMUX_BASHRC"; do
    if [ -f "$RC" ] || [ "$RC" = "$BASHRC_FILE" ]; then
        touch "$RC"
        if ! grep -q "Asriel-Proxy-Gemini Case-Insensitive CLI Handler" "$RC"; then
            echo "$CASE_HOOK_BASH" >> "$RC"
            echo "   -> Injected bash case-handler into $RC"
        fi
    fi
done

# Append to zshrc if present
if [ -f "$ZSHRC_FILE" ] || [ -n "$ZSH_VERSION" ]; then
    touch "$ZSHRC_FILE"
    if ! grep -q "Asriel-Proxy-Gemini Case-Insensitive CLI Handler" "$ZSHRC_FILE"; then
        echo "$CASE_HOOK_ZSH" >> "$ZSHRC_FILE"
        echo "   -> Injected zsh case-handler into $ZSHRC_FILE"
    fi
fi

echo "[4/4] CLI hook injection complete."
echo "==================================================="
echo " SUCCESS! Universal shortcut installed."
echo " You can now type any combination from ANY folder:"
echo "    asriel"
echo "    Asriel"
echo "    ASRIEL"
echo "    aSriel"
echo "==================================================="
