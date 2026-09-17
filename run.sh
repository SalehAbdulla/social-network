#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"

# WSL's dependency checks and process management need Linux-specific utilities.
if [[ "$(uname -s)" == Linux ]] && grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
	exec bash "$ROOT_DIR/scripts/run-wsl.sh" "$@"
fi

frontend_port=4000
backend_port="${PORT:-5174}"

# `go run` and `next dev` keep the listening socket in a child process, so killing
# only the shell that started them leaves that child behind, still holding the port.
kill_tree() {
	local pid="$1"
	local child
	for child in $(pgrep -P "$pid" 2>/dev/null || true); do
		kill_tree "$child"
	done
	kill -TERM "$pid" 2>/dev/null || true
}

is_running() {
	kill -0 "$1" 2>/dev/null
}

cleanup() {
	trap - INT TERM EXIT
	kill_tree "$backend_pid"
	kill_tree "$frontend_pid"
	wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

# Fail fast with an actionable message instead of a raw EADDRINUSE stack trace.
for port in "$frontend_port" "$backend_port"; do
	listener="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
	if [[ -n "$listener" ]]; then
		printf 'Cannot start Social Network: port %s is already in use by a process outside this launcher.\n' "$port" >&2
		ps -p "$listener" -o pid=,command= >&2 || true
		printf 'Stop that server in its terminal, then run ./run.sh again.\n' >&2
		exit 1
	fi
done

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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

printf 'Starting Social Network at http://localhost:%s (Ctrl+C stops both services).\n' "$frontend_port"

# Shut the surviving service down as soon as either one stops or fails.
while is_running "$backend_pid" && is_running "$frontend_pid"; do
	sleep 1
done

if is_running "$backend_pid"; then
	printf 'Frontend stopped; stopping the backend too.\n' >&2
else
	printf 'Backend stopped; stopping the frontend too.\n' >&2
fi
