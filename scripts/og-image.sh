#!/usr/bin/env sh
# Render scripts/og-image.html to public/assets/og-image.png (1200x630) with headless Chromium.
# Set CHROME to a Chrome/Chromium binary if none is found on PATH.
set -eu
cd "$(dirname "$0")/.."
CHROME="${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || ls "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell 2>/dev/null | head -n1)}"
# --no-sandbox: Ubuntu 23.10+ blocks Chromium's sandbox via AppArmor. Safe here because
# the only page loaded is our own local file, with no network access.
"$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1200,630 \
    --screenshot="$PWD/public/assets/og-image.png" "file://$PWD/scripts/og-image.html"
