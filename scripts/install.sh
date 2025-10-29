#!/usr/bin/env bash
set -euo pipefail

APP_NAME="moka"
ENTRY_FILE="./index.ts"
OUT_DIR="$(pwd)/dist"
OUT_FILE="$OUT_DIR/$APP_NAME"
INSTALL_DIR="$HOME/.local/bin"
SYSTEM_BIN="/usr/local/bin/$APP_NAME"

echo "🍏 Installing $APP_NAME on macOS..."
echo

# ── 1️⃣ Check for Bun ────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  echo "❌  Bun is not installed. Please install it first:"
  echo "   curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# ── 2️⃣ Build the executable ─────────────────────────────────────────
echo "📦  Building Bun single‑file binary..."
mkdir -p "$OUT_DIR"
bun build --compile --minify --sourcemap --bytecode "$ENTRY_FILE" --outfile "$OUT_FILE"

# ── 3️⃣ Install to ~/.local/bin ─────────────────────────────────────
echo "📥  Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp "$OUT_FILE" "$INSTALL_DIR/$APP_NAME"
chmod +x "$INSTALL_DIR/$APP_NAME"

# ── 4️⃣ Link into /usr/local/bin if possible ────────────────────────
if [ -w /usr/local/bin ]; then
  echo "🔗  Linking system‑wide binary in /usr/local/bin..."
  ln -sf "$INSTALL_DIR/$APP_NAME" "$SYSTEM_BIN"
else
  echo "⚠️  No write permission for /usr/local/bin; skipping system link."
  echo "   Add this line to your ~/.zshrc or ~/.bashrc if not already present:"
  echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── 5️⃣ Validate install ────────────────────────────────────────────
echo
echo "✅  Done!  You can now run:"
echo "   $APP_NAME [path-to-jacoco.xml]"

if command -v "$APP_NAME" &>/dev/null; then
  echo
  "$APP_NAME" --help || true
else
  echo
  echo "⚠️  You may need to restart your terminal for PATH changes to take effect."
fi
