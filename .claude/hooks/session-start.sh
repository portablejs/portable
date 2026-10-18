#!/bin/bash
# Cloud sessions start with Node 22 and pnpm 10; the repo needs Node 24 and pnpm 11.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

prefix="$HOME/.cache/portable-node24"
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  [ -x "$prefix/node_modules/node/bin/node" ] || npm install --prefix "$prefix" --silent node@24
  mkdir -p "$HOME/bin"
  ln -sf "$(readlink -f "$prefix/node_modules/node/bin/node")" "$HOME/bin/node"
  echo "export PATH=\"$HOME/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  export PATH="$HOME/bin:$PATH"
fi
[ "$(pnpm -v | cut -d. -f1)" -ge 11 ] || npm install -g --silent pnpm@11
cd "$CLAUDE_PROJECT_DIR" && pnpm install --silent
