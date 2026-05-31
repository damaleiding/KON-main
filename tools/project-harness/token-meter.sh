#!/usr/bin/env sh
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN=""

if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
else
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "[FAIL] Node runtime available"
  echo "  node is not on PATH and no known local Node runtime was found."
  echo "  macOS install: brew install node"
  echo "  Windows install: winget install --id OpenJS.NodeJS.LTS -e --source winget"
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/token-meter.mjs" "$@"
