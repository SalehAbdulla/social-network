#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

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