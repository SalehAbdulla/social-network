#!/usr/bin/env bash
# Backup -> wipe -> restore drill for everything the `social-data` volume holds.
#
# It runs against a throwaway data directory, so it never touches a real
# installation, and it proves that the two things the volume contains are enough
# to bring the application back exactly as it was:
#
#   1. the SQLite database, copied with SQLite's own `.backup` while the server
#      is still running (a plain `cp` of a live database is not safe);
#   2. the upload directory, which is where media rows point.
#
# The drill keeps its session cookie across the wipe, so a successful
# `GET /api/v1/users/me` afterwards proves the session table came back too.
#
# Usage: scripts/backup-restore-drill.sh
#   DRILL_DIR   work directory (default backend/tmp/backup-drill)
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
WORK_DIR="${DRILL_DIR:-$ROOT_DIR/backend/tmp/backup-drill}"
DATA_DIR="$WORK_DIR/data"    # stands in for the social-data volume
BACKUP_DIR="$WORK_DIR/backup"
DB="$DATA_DIR/socialnetwork.db"
UPLOADS="$DATA_DIR/uploads"
BINARY="$WORK_DIR/backend"
JAR="$WORK_DIR/cookies.txt"
PORT="$(node -e 'const s = require("net").createServer(); s.listen(0, "127.0.0.1", () => { process.stdout.write(String(s.address().port)); s.close(); })')"
BASE="http://127.0.0.1:$PORT"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$1"; }
fail() { printf 'DRILL FAILED: %s\n' "$1" >&2; exit 1; }
check() { [[ "$2" == "$3" ]] || fail "$1: expected [$3], got [$2]"; printf '  ok  %s (%s)\n' "$1" "$2"; }

# Values the run has to remember across the wipe.
USER_ID="" POST_ID="" MEDIA_URL="" MEDIA_BYTES="" BEFORE_COUNTS="" BEFORE_FILES=""

start_server() {
  export DATABASE_PATH="$DB" UPLOAD_DIR="$UPLOADS" APP_ENV=development
  export FRONTEND_ORIGIN=http://localhost:4000 PORT
  ( cd "$ROOT_DIR/backend" && exec "$BINARY" >>"$WORK_DIR/server.log" 2>&1 ) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/users/me" || true)" == "401" ]] && return 0
    sleep 0.5
  done
  fail "the backend did not become ready; see $WORK_DIR/server.log"
}

stop_server() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
}

# Call the API with the drill's cookie jar: $1 method, $2 path, the rest is curl.
api() {
  local method="$1" path="$2"; shift 2
  curl -sS -c "$JAR" -b "$JAR" -X "$method" "$BASE$path" -o "$WORK_DIR/response.json" -w '%{http_code}' "$@"
}

counts() { sqlite3 "$DB" "SELECT (SELECT COUNT(*) FROM user) || ',' || (SELECT COUNT(*) FROM post) || ',' || (SELECT COUNT(*) FROM media) || ',' || (SELECT COUNT(*) FROM session)"; }
files() { ls -1 "$UPLOADS" | wc -l | tr -d ' '; }
field() { node -e 'let v = require(process.argv[1]).data; for (const key of process.argv[2].split(".")) v = v?.[key]; process.stdout.write(String(v ?? ""))' "$WORK_DIR/response.json" "$1"; }

rm -rf "$WORK_DIR"
mkdir -p "$UPLOADS" "$BACKUP_DIR"

step "Build the backend"
( cd "$ROOT_DIR/backend" && go build -o "$BINARY" ./cmd )
printf '  ok  binary built\n'

step "Start the application on a fresh, empty volume"
start_server
printf '  ok  listening on %s\n' "$BASE"

step "Create an account, an upload and a post that carries it"
check "register" "$(api POST /api/v1/auth/register \
  --data-urlencode 'firstName=Drill' --data-urlencode 'lastName=User' \
  --data-urlencode 'nickName=drilluser' --data-urlencode 'email=drill@example.com' \
  --data-urlencode 'password=DrillPass123!' --data-urlencode 'confirmPassword=DrillPass123!' \
  --data-urlencode 'birthDate=1990-01-01' --data-urlencode 'gender=male')" "201"
check "the account is readable with the session the signup created" "$(api GET /api/v1/users/me)" "200"
USER_ID="$(field userId)"
node -e 'require("fs").writeFileSync(process.argv[1], Buffer.from(process.argv[2], "base64"))' "$WORK_DIR/pixel.png" \
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='
check "upload" "$(api POST /api/v1/media -F "file=@$WORK_DIR/pixel.png")" "201"
MEDIA_URL="$(field url)"
printf '{"title":"Drill post","content":"A post whose photo has to survive the restore.","privacy":"public","imageUrls":["%s"]}' "$MEDIA_URL" > "$WORK_DIR/post.json"
check "post" "$(api POST /api/v1/posts -H 'Content-Type: application/json' --data @"$WORK_DIR/post.json")" "201"
POST_ID="$(field postId)"
MEDIA_ID="${MEDIA_URL##*/}"
MEDIA_BYTES="$(wc -c < "$UPLOADS/$MEDIA_ID" | tr -d ' ')"

BEFORE_COUNTS="$(counts)"
BEFORE_FILES="$(files)"
printf '  ok  before the backup: users,posts,media,sessions = %s · upload files = %s\n' "$BEFORE_COUNTS" "$BEFORE_FILES"
[[ "$BEFORE_COUNTS" == "1,1,1,1" ]] || fail "expected one user, post, media row and session, found $BEFORE_COUNTS"

step "Back up the live database with sqlite3 .backup, and the uploads beside it"
sqlite3 "$DB" ".backup '$BACKUP_DIR/socialnetwork.db'"
cp -R "$UPLOADS" "$BACKUP_DIR/"
check "the backup passes SQLite's integrity check" "$(sqlite3 "$BACKUP_DIR/socialnetwork.db" 'PRAGMA integrity_check')" "ok"
check "backed up rows" "$(sqlite3 "$BACKUP_DIR/socialnetwork.db" "SELECT (SELECT COUNT(*) FROM user) || ',' || (SELECT COUNT(*) FROM post) || ',' || (SELECT COUNT(*) FROM media) || ',' || (SELECT COUNT(*) FROM session)")" "$BEFORE_COUNTS"
check "backed up files" "$(ls -1 "$BACKUP_DIR/uploads" | wc -l | tr -d ' ')" "$BEFORE_FILES"

step "Stop the application and wipe the volume"
stop_server
rm -rf "$DATA_DIR"
[[ ! -e "$DB" ]] || fail "the database survived the wipe"
printf '  ok  %s is gone\n' "$DATA_DIR"

step "Restore from the backup"
mkdir -p "$UPLOADS"
cp "$BACKUP_DIR/socialnetwork.db" "$DB"
cp -R "$BACKUP_DIR/uploads/." "$UPLOADS/"
printf '  ok  database and uploads restored\n'

step "Start again and verify the account, the session, the post and the photo"
start_server
check "the cookie made before the wipe still authenticates" "$(api GET /api/v1/users/me)" "200"
check "the same account came back" "$(field userId)" "$USER_ID"
check "the post is readable again" "$(api GET "/api/v1/post?id=$POST_ID")" "200"
check "the post points at the same photo" "$(field 'imageUrls.0')" "$MEDIA_URL"
check "the photo is served" "$(api GET "$MEDIA_URL")" "200"
check "the served bytes match the file that was backed up" "$(wc -c < "$WORK_DIR/response.json" | tr -d ' ')" "$MEDIA_BYTES"
check "restored rows" "$(counts)" "$BEFORE_COUNTS"
check "restored files" "$(files)" "$BEFORE_FILES"

stop_server
printf '\nDRILL PASSED: %s rows and %s uploaded file(s) came back, and the session made before the wipe is still valid.\n' "$BEFORE_COUNTS" "$BEFORE_FILES"
