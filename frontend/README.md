# Social Network frontend

The Next.js frontend calls the Go backend through the same origin. API requests
to `/api/v1/*`, uploaded media, and the `/ws` WebSocket are proxied to `BACKEND_URL`.
The browser sends the backend's HTTP-only session cookie with these requests.

## Same-origin proxy

Two mechanisms keep the browser on the Next.js port (4000):

- **Rewrites.** `next.config.ts` maps `/api/v1/:path*` and `/ws` onto
  `${BACKEND_URL}/api/v1/:path*` and `${BACKEND_URL}/ws`. `BACKEND_URL` defaults to
  `http://127.0.0.1:5174` and is compiled into the build — the Docker image passes
  `http://backend:5174` as a build argument — so moving the backend means rebuilding the
  frontend image rather than setting a runtime variable. `experimental.proxyClientMaxBodySize`
  is raised to `52mb` so a request up to the backend's 51 MiB body ceiling can pass through
  the middleware layer unchanged.
- **Page gate.** `src/proxy.ts` runs as middleware over the matcher
  `['/((?!api/|_next/|ws$).*)']`, which deliberately excludes `/api/*`, `/ws` and the build
  assets: the middleware therefore never buffers an upload or a socket upgrade. It redirects
  an anonymous page visit to `/login` when the `session_token` cookie is absent, and allows
  the public paths listed in the same file. It is a convenience, not the access check — the
  backend validates the session on every request and answers 401, which `BackendProvider`
  turns into a redirect.

Both the fetch and the socket are same-origin, so the HttpOnly `session_token` cookie is
first-party and the backend's `Origin` check sees the frontend's public origin. That is why
`FRONTEND_ORIGIN` has to match that origin exactly, and why a WebSocket upgrade is refused
when the `Origin` header is missing.

## Run locally

The root `./run.sh` keeps the existing startup behavior outside WSL. Inside WSL,
it automatically delegates to `scripts/run-wsl.sh` for the features below.

For WSL, keep the working copy in Ubuntu's filesystem, for example
`~/projects/social-network`, for faster installs and builds. Open that directory
with VS Code's WSL support and run `./run.sh` from the project root. The launcher
checks native dependencies, installs missing packages with `npm ci`, and starts
both services. Ctrl+C stops both services and their child processes. You can also
run `./run.sh status` or `./run.sh stop` from another terminal. These commands
work from either working copy: starting a second copy reports the directory
already running. Edit files in that directory to see your changes in the app.
The launcher checks for occupied ports before starting either service.

The WSL helper uses the Linux versions of Node.js/npm and Go, and the `setsid`,
`flock`, and `ss` utilities supplied by Ubuntu. It loads nvm when Node.js is not
on PATH.
Its automatic install skips the registry's audit request; use `npm audit`
separately when you want a vulnerability report.

From `backend`, start the backend in one terminal:

```powershell
.\dev.cmd
```

On Ubuntu / WSL, use `sh ./dev.sh` instead.

The backend starts on port 5174. Register an account through the frontend; startup does not create demo users. Go and a C compiler are required; the script detects GCC at `C:\msys64\mingw64\bin` on Windows.

In `frontend/`, copy `.env.example` to `.env.local` and set:

```dotenv
BACKEND_URL=http://127.0.0.1:5174
```

Check `.env.local` too if you have one, since its values override `.env`.
Then run in a second terminal from `frontend`:

```powershell
npm install
npm run dev
```

Run the install command inside the same operating system as the dev server.
For Ubuntu / WSL, use Ubuntu's Node.js and npm. Windows native dependencies in a
shared `node_modules` folder cannot be loaded by Linux.

If Next.js reports missing `@next/swc-linux-*` packages or falls back to WASM,
stop the dev server with Ctrl+C and run these commands in the Ubuntu terminal,
from `frontend`:

```sh
npm install --include=optional
npm run dev
```

This installs the Linux native packages required by Next.js, Tailwind, and
Lightning CSS. The project enables optional dependencies in `.npmrc`; keep the
lockfile, which includes both Windows and Linux packages. Reinstall dependencies
when switching the operating system used to run this shared checkout.

Open **http://localhost:4000**, register, and sign in. Anonymous visits and expired sessions redirect to login. Use separate browser profiles for different accounts. Sessions live in the backend's `session` table, so they survive a backend restart; an account has one session at a time and signing in again revokes the previous token.

Messages contains People and Groups conversation tabs. Each group opens inside the inbox with Chat, Posts, Events, Media, and Group info tabs. Events appear as cards in the group chat with Going / Not going responses. Owners can update the group name, description and photo, approve requests, remove members, transfer ownership, or delete the group. Members can invite people, leave, and manage their own posts, photos, comments, messages and events. Owners can also delete group content.

Post titles are optional. Images are checked before upload and previewed in bounded square frames without stretching. JPEG, PNG, GIF and WebP are accepted, up to four images and 10 MB per image; PDFs are rejected. Lists grow as you scroll: `LoadMore` presses its own button for you when the end of the list comes into view, one page is in flight at a time, and a throttle window keeps a fast scroll from queueing repeat requests. Chat typing and live refreshes are throttled.

## Docker

From the repository root:

```sh
docker compose up --build -d
docker compose logs -f
docker compose down
```

The `frontend` and `backend` services each have their own image and container. Open `http://localhost:4000`; the frontend proxies HTTP and WebSocket traffic to `backend:5174`. The backend port stays internal. SQLite and uploaded images persist in the named `social-data` volume. `docker compose down` retains it. For an HTTPS deployment, set `APP_ENV=production` and `FRONTEND_ORIGIN` to your HTTPS origin.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npm run build
npm run test:integration
```

The integration command builds and starts temporary backend and frontend servers
on available ports, seeds a separate database, and drives two headless Chrome
sessions through the UI. It does not use your development database. Chrome must
be installed; set `CHROME_PATH` if it is outside its default Windows location.
Logs, the test database, and screenshots remain in `backend/tmp/integration-*`.
The temporary servers stop when the check finishes. Go uses `backend/tmp/go-build`
for its cache unless `GOCACHE` is already set.
