#!/usr/bin/env bash
# Build the two project images (and, with --up, start the containers).
#
#   ./scripts/build-images.sh          validate compose.yaml and build both images
#   ./scripts/build-images.sh --up     ...then start them and wait for the frontend
#   ./scripts/build-images.sh --check  only validate compose.yaml, build nothing
#
# `docker compose` (v2) is preferred, `docker-compose` (v1) is accepted, so the
# script works on hosts that only have one of the two.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-4000}"
COMPOSE_FILE="$ROOT_DIR/compose.yaml"
UP=0
CHECK_ONLY=0

for argument in "$@"; do
  case "$argument" in
    --up) UP=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'Unknown option: %s (try --help)\n' "$argument" >&2; exit 2 ;;
  esac
done

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  printf 'Neither `docker compose` nor `docker-compose` is available.\n' >&2
  exit 1
fi

if ! "${COMPOSE[@]}" version >/dev/null 2>&1; then
  printf 'The Compose plugin is not usable on this host.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"

printf '== Validating %s\n' "$COMPOSE_FILE"
"${COMPOSE[@]}" config >/dev/null
printf '  ok  compose.yaml renders\n'

if [[ "$CHECK_ONLY" == 1 ]]; then
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  printf 'No reachable Docker daemon. Start Docker Desktop (or colima) and try again.\n' >&2
  exit 1
fi

printf '\n== Building social-network-backend and social-network-frontend\n'
"${COMPOSE[@]}" build

printf '\n== Images\n'
docker image ls --filter reference='social-network-*' --format '  {{.Repository}}:{{.Tag}}  {{.Size}}'

if [[ "$UP" == 1 ]]; then
  printf '\n== Starting the containers\n'
  "${COMPOSE[@]}" up -d
  for _ in $(seq 1 120); do
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FRONTEND_PORT/login" || true)" == "200" ]]; then
      printf '\n  ok  the frontend answers on http://localhost:%s\n' "$FRONTEND_PORT"
      printf '\n== Containers\n'
      docker ps --filter name=social-network --format '  {{.Names}}  {{.Image}}  {{.Status}}  {{.Size}}'
      exit 0
    fi
    sleep 1
  done
  printf '\nThe frontend did not answer on port %s; check `%s logs`.\n' "$FRONTEND_PORT" "${COMPOSE[*]}" >&2
  exit 1
fi

printf '\nBuilt. Start the stack with `%s up -d`, or rerun this script with --up.\n' "${COMPOSE[*]}"
