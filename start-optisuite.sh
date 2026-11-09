#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d "dist" ]; then
  npm run build
fi

echo "=========================================================="
echo "  SIMA Optometry App — Clinical Instrument Launch"
echo "  Note: To allow tablet/remote controller access across LAN,"
echo "  ensure TCP port 3020 is allowed on your firewall:"
echo "    sudo ufw allow 3020/tcp"
echo "=========================================================="

# Launch Electron desktop application if graphical session available, otherwise start local server
if command -v npx >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  npx electron . --no-sandbox
else
  node server/index.mjs
fi
