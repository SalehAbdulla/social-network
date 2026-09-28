# Social Network

A Facebook-like social network: profiles, follow requests, posts with three privacy
levels, comments, groups with events and a shared chat, notifications, and realtime
private messaging. One Go service owns the data and the WebSocket hub; a Next.js app
serves the UI and proxies everything to that service, so the browser only ever talks
to one origin and the session cookie stays first-party.

The full task description lives in the project handout, not here. This file explains
what was built, how it is laid out, and how to run it.

## What it does

**Accounts and profiles** — register with the five mandatory fields plus an optional
nickname (generated when left blank), avatar, About Me and a public/private choice;
bcrypt password hashing; HttpOnly cookie sessions that survive a restart. Profiles
show followers/following, posts, and a media tab that merges post and comment photos.
Following a private profile is a request the owner accepts or declines; following a
public profile happens immediately.

**Posts, comments and reactions** — three privacy levels (`public`, `followers` for
"almost private", `selected` for "only the followers you pick"), up to four images or
GIFs per post, comments with their own image, and reaction scores. Stories expire
after 24 hours.

**Groups** — create, browse, join by request or invitation, post, comment, share
media, schedule events with Going / Not going replies, chat together, transfer
ownership, and leave or delete.

**Notifications and chat** — group invitations, join requests, group events, follow
requests and comments raise notifications; private messages raise a different event.
Both arrive live over `/ws` and both are counted separately in the sidebar. Chat has
typing indicators, read receipts, presence, edits and scoped deletion.

**Media** — JPEG, PNG, GIF, WebP, MP4 and WebM uploads with the type sniffed from the
bytes, images capped at 10 MB and video at 50 MB, and a collector that reclaims
uploads once the post, comment, story or message pointing at them is gone.

## Stack

| Layer | Choice |
| --- | --- |
| Backend | Go 1.25, `net/http` with the pattern-based `ServeMux`, layering of handler → service → repository |
| Database | SQLite (`mattn/go-sqlite3`) with embedded, versioned SQL migrations (`golang-migrate`) applied at boot |
| Realtime | `gorilla/websocket` hub for chat, typing, presence and notification pushes |
| Auth | `golang.org/x/crypto/bcrypt` plus database-backed cookie sessions |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Client data | `axios` against a typed wrapper, `react-hot-toast` for errors, `lucide-react` icons |
| Packaging | Docker Compose: one image per service, one named volume for the database and uploads |

## Layout

```
backend/
  cmd/                     main, router, security middleware, integration tests, seed
  pkg/app/handlers/        HTTP and WebSocket handlers (validation, responses)
  pkg/app/service/         business rules (privacy, permissions, notifications, sessions)
  pkg/app/repositories/    SQL; the post-visibility fragment lives in PostRepository.go
  pkg/db/migrations/sqlite versioned up/down migrations, applied automatically at boot
  pkg/websocket/           hub, clients, frame types
  pkg/config, pkg/logger, pkg/middleware, pkg/models, pkg/payload
frontend/
  src/app/                 routes (feed, post, profile, messages, groups, notifications, login)
  src/app/components/      UI building blocks, including the dialogs and their focus contract
  src/app/api/             axios client and the typed request helpers
  src/app/lib/             shared hooks: paging, live refresh, dialog focus
  src/proxy.ts             page-level session gate (the API and /ws are excluded)
  scripts/                 browser smoke suite driven over the Chrome DevTools Protocol
compose.yaml               both services and the social-data volume
DEPLOYMENT.md              environment variables, headers, limits, backup and release checks
TODO.md                    the open work list and the reasoning behind what is closed
```

## Run it

### Docker (what a deployment uses)

```sh
cp .env.example .env      # APP_ENV + FRONTEND_ORIGIN; see DEPLOYMENT.md for the rest
docker compose up --build -d
open http://localhost:4000
```

Two images are built (`social-network-backend`, `social-network-frontend`), both run as
unprivileged users, and only the frontend publishes a port — bound to loopback, with the
reverse proxy expected to sit in front of it. SQLite and uploads live in the `social-data`
volume, and migrations run at backend startup. Stop with `docker compose down`; do not add
`-v` unless you mean to delete all application data.

### Local development

```sh
./run.sh                  # starts backend (5174) and frontend (4000), Ctrl+C stops both
```

`run.sh` delegates to `scripts/run-wsl.sh` under WSL. To run the halves by hand:

```sh
cd backend  && sh ./dev.sh          # Windows: .\dev.cmd
cd frontend && npm ci && npm run dev
```

The frontend needs `BACKEND_URL` in `frontend/.env.local` (copy `.env.example`); Next.js
rewrites `/api/v1/*` and `/ws` to that origin, so the browser keeps using port 4000 only.
Register an account on the login page — nothing is seeded, and there is no development
login shortcut.

## Checks

```sh
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build
cd frontend && npm run test:integration
```

The last command builds temporary backend and frontend servers, seeds an isolated database
under `backend/tmp`, and drives headless Chrome through the real UI; it needs Chrome
installed (`CHROME_PATH` overrides the location). `docker compose config` and
`docker compose build` are the container checks, and `npm audit` / `govulncheck ./...` cover
dependency advisories.

## Rules worth knowing before changing code

- **Post visibility** is one SQL fragment shared by every read path — the feed, a single
  post, profile posts, the likes tab, profile media, comments and direct media access — so
  the six surfaces cannot drift apart. `followers` is a live relation (unfollowing revokes
  access), while `selected` is a grant recorded when the post was written: it survives an
  unfollow and only an edit re-validates it.
- **Media access** mirrors the post or comment it hangs off. Avatars, group images and
  story media are readable by any signed-in member, and a cover photo needs a public
  profile or a follow. Stories carry no audience, which is recorded as a decision in
  `TODO.md`.
- **Sessions** live in the `session` table (14 days idle, 30 days absolute), so a backend
  restart does not sign anyone out. Logging in revokes the previous token.
- **Uploads** are typed by their bytes, not their filename, and are answered `400` for an
  unreadable or empty file and `413` past a size ceiling.

## Documentation map

| File | What it covers |
| --- | --- |
| `DEPLOYMENT.md` | Environment variables, security headers, request and upload limits, backup/rollback, release checks |
| `backend/README.md` | Backend environment, the chat permission rule, how to test |
| `frontend/README.md` | Local setup, the same-origin proxy contract, the browser checks |
| `TODO.md` | Every open item with its priority, and the reasoning recorded with each closed one |
| `SocialNetworkERD.drawio` | Entity-relationship diagram of the schema |
