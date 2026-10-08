#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"

ACTION="${1:-start}"
if [[ $# -gt 1 || ! "$ACTION" =~ ^(start|status|stop)$ ]]; then
	printf 'Usage: ./run.sh [start|status|stop]\n' >&2
	exit 2
fi
if ! command -v flock >/dev/null 2>&1; then
	printf 'Missing required command: flock. Install it in your Linux environment first.\n' >&2
	exit 1
fi

original_umask="$(umask)"
umask 077
RUN_DIR="$HOME/.cache/social-network"
STATE_FILE="$RUN_DIR/launcher.state"
mkdir -p "$RUN_DIR"
exec 8>"$RUN_DIR/control.lock"
flock 8
exec 9>"$RUN_DIR/launcher.lock"

process_start_time() {
	local process_stat
	local -a fields
	IFS= read -r process_stat 2>/dev/null < "/proc/$1/stat" || return 1
	read -r -a fields <<< "${process_stat##*) }"
	printf '%s\n' "${fields[19]}"
}

read_instance() {
	local recorded_start
	[[ -f "$STATE_FILE" ]] || return 1
	{
		IFS= read -r running_pid
		IFS= read -r recorded_start
		IFS= read -r running_root
	} < "$STATE_FILE" || return 1
	[[ "$running_pid" =~ ^[0-9]+$ && "$recorded_start" =~ ^[0-9]+$ ]] || return 1
	[[ "$(process_start_time "$running_pid")" == "$recorded_start" ]]
}

if ! flock -n 9; then
	if ! read_instance; then
		printf 'A launcher is shutting down or its state cannot be verified. Try again shortly, or use Ctrl+C in its terminal.\n' >&2
		exit 1
	fi
	if [[ "$ACTION" == stop ]]; then
		printf 'Stopping Social Network from %s...\n' "$running_root"
		kill -TERM "$running_pid" 2>/dev/null || true
		if ! flock -w 15 9; then
			printf 'Shutdown is still in progress. Check ./run.sh status.\n' >&2
			exit 1
		fi
		printf 'Social Network stopped.\n'
	else
		printf 'Social Network is already running or starting from:\n  %s\nOpen http://localhost:4000\nTo stop both services: ./run.sh stop\n' "$running_root"
	fi
	exit 0
fi

if [[ "$ACTION" != start ]]; then
	printf 'No Social Network launcher is running.\n'
	exit 0
fi

service_pids=()
cleanup() {
	trap - INT TERM EXIT
	for pid in "${service_pids[@]}"; do
		kill -TERM -- "-$pid" 2>/dev/null || true
	done
	for pid in "${service_pids[@]}"; do
		wait "$pid" 2>/dev/null || true
	done
	rm -f -- "$STATE_FILE"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n%s\n%s\n' "$$" "$(process_start_time "$$")" "$ROOT_DIR" > "$STATE_FILE"
umask "$original_umask"
flock -u 8
exec 8>&-

if ! command -v node >/dev/null 2>&1 && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
	source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

for command_name in node npm go setsid ss; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		printf 'Missing required command: %s. Install it in your Linux environment first.\n' "$command_name" >&2
		exit 1
	fi
done

if [[ "$(uname -s)" == Linux && "$(node -p 'process.platform')" != linux ]]; then
	printf 'Use Linux Node.js and npm when running this script in WSL.\n' >&2
	exit 1
fi

backend_port="${PORT:-5174}"
if [[ ! "$backend_port" =~ ^[0-9]{1,5}$ ]] || (( 10#$backend_port < 1 || 10#$backend_port > 65535 || 10#$backend_port == 4000 )); then
	printf 'PORT must be between 1 and 65535 and different from frontend port 4000.\n' >&2
	exit 1
fi
for port in 4000 "$backend_port"; do
	if [[ -n "$(ss -H -ltn "sport = :$port")" ]]; then
		printf 'Cannot start Social Network: port %s is already in use by a process outside this launcher.\n' "$port" >&2
		ss -ltnp "sport = :$port" >&2
		printf 'Stop that server in its terminal, then run ./run.sh again.\n' >&2
		exit 1
	fi
done

if [[ "$ROOT_DIR" == /mnt/* ]] && grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
	printf 'WSL: installs and builds are much faster from ~/projects than from a Windows-mounted drive.\n'
fi

cd "$ROOT_DIR/frontend"
printf 'Checking frontend dependencies...\n'
check_dependencies() {
	node <<'NODE'
for (const name of ['next/package.json', 'react', 'lightningcss', '@tailwindcss/oxide']) {
  try { require(name); }
  catch { console.error(`Missing or incompatible dependency: ${name}`); process.exit(1); }
}
NODE
}
if ! check_dependencies; then
	printf 'Installing dependencies for this operating system (first run only)...\n'
	setsid npm ci --include=optional --no-audit --no-fund 9>&- &
	service_pids=("$!")
	wait "${service_pids[0]}"
	service_pids=()
	check_dependencies
fi

printf 'Starting Social Network at http://localhost:4000 (Ctrl+C or ./run.sh stop stops both services).\n'
(
	cd "$ROOT_DIR/backend"
	exec setsid sh ./dev.sh
) 9>&- &
service_pids+=("$!")

(
	cd "$ROOT_DIR/frontend"
	exec setsid npm run dev
) 9>&- &
service_pids+=("$!")

wait -n "${service_pids[@]}"
