#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

# WSL's dependency checks and process management need Linux-specific utilities.
if [[ "$(uname -s)" == Linux ]] && grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
	exec bash "$ROOT_DIR/scripts/run-wsl.sh" "$@"
fi

cleanup() {
	kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
	wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

(
	cd "$ROOT_DIR/backend"
	sh ./dev.sh
) &
backend_pid=$!

(
	cd "$ROOT_DIR/frontend"
	npm run dev
) &
frontend_pid=$!

wait "$backend_pid" "$frontend_pid"
