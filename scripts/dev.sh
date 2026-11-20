#!/usr/bin/env bash
# Run the status page locally at http://localhost:3000 (or $PORT), with live reload.
#
# Clones upptime/status-page into ./status-page (gitignored) on first run and
# installs deps if needed. scripts/dev-config.js links assets/ into the site,
# generates the config (with links pointing at localhost), and regenerates it
# when .upptimerc.yml or anything in assets/ changes, which reloads the browser.
set -euo pipefail

cd "$(dirname "$0")/.."

# One port for both sapper and dev-config.js (which builds every link from it).
# Passing it explicitly makes sapper fail if it's taken instead of silently moving.
export PORT="${PORT:-3000}"

if [ ! -d status-page ]; then
  git clone --depth 1 https://github.com/upptime/status-page status-page
  # Drop its history so VS Code doesn't list it as a second repo in Source Control.
  # To update it later, delete status-page/ and rerun.
  rm -rf status-page/.git
fi

(cd status-page && { [ -d node_modules ] || npm install; })

node scripts/dev-config.js
node scripts/dev-config.js --watch &
watcher=$!
trap 'kill "$watcher" 2>/dev/null' EXIT

cd status-page
npx sapper dev --port "$PORT"
