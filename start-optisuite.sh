#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d "dist" ]; then
  npm run build
fi

# Launch Electron desktop application if graphical session available, otherwise start local server
if command -v npx >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  npx electron . --no-sandbox
else
  node server/index.mjs
fi
