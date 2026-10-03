# Social Network frontend

The Next.js frontend calls the Go backend through the same origin. API requests
to `/api/v1/*`, uploaded media, and the `/ws` WebSocket are proxied to `BACKEND_URL`.
The browser sends the backend's HTTP-only session cookie with these requests.

## Same-origin proxy

Two mechanisms keep the browser on the Next.js port (4000):

- **Rewrites.** `next.config.ts` maps `/api/v1/:path*` and `/ws` onto
  `${BACKEND_URL}/api/v1/:path*` and `${BACKEND_URL}/ws`. The value is compiled into the
  build — the Docker image passes `http://backend:5174` as a build argument — so moving the
  backend means rebuilding the frontend image rather than setting a runtime variable.
  `npm run dev` falls back to `http://127.0.0.1:5174`, but a **production build refuses to
  guess**: with `BACKEND_URL` unset it stops with an error rather than compiling a loopback
  address into a container that cannot reach it, and it also refuses a value that is not an
  http(s) URL or that ends with a slash (which would make every rewrite carry a double slash).
  CI passes a placeholder for the same reason. `experimental.proxyClientMaxBodySize`
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

The root `./run.sh` keeps the existing startup behavior outside WSL (`make dev` from the repository
root is the same call, and `make help` lists the rest of the commands). Inside WSL,
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

Open **http://localhost:4000**, register, and sign in. Anonymous visits and expired sessions redirect to login. Use separate browser profiles for different accounts. Sessions live in the backend's `session` table, so they survive a backend restart; an account has one session at a time and signing in again revokes the previous token. Changing the password from your own profile (`PUT /api/v1/users/me/password`, driven by the `ChangePassword` dialog) rotates it the same way, so any other browser signed in to the account is signed out and this one keeps working on the replacement cookie.

Messages contains People and Groups conversation tabs. Each group opens inside the inbox with Chat, Posts, Events, Media, and Group info tabs. Events appear as cards in the group chat with Going / Not going responses. Owners can update the group name, description and photo, approve requests, remove members, transfer ownership, or delete the group. Members can invite people, leave, and manage their own posts, photos, comments, messages and events. Owners can also delete group content.

Post titles are optional. Images are checked before upload and previewed in bounded square frames without stretching; each selected tile also reports the file's own size and, for an image, the canvas measured while checking it, so a rejection is never the first mention of either. JPEG, PNG, GIF and WebP are accepted, up to four images and 10 MB per image; PDFs are rejected. The ceilings are not typed here: they come from `src/app/lib/mediaLimits.ts`, which the backend's `media_limits_test.go` compares against the constants the server enforces, so the two can only change together — that module also names the two derivative caps below. An image wider than the 1600 px cap is re-encoded in the browser before it is sent (`src/app/lib/downscale.ts`): a JPEG stays a JPEG at 0.85, anything else becomes a PNG so an alpha channel survives, and a GIF is left untouched because a still frame of an animation is a different picture rather than a smaller one. Nothing is ever enlarged, the 10 MB ceiling is on the file that was chosen rather than on the shrink, and a file the browser cannot decode is sent as it is — the shrink is an optimisation the upload must not depend on.
A post's comments are the inline list under the card on a wide screen and a bottom drawer on a phone — opened by the comment button, dismissed with Escape, the backdrop or its close button, and holding the same composer and thread either way. Which of the two is rendered is `useMediaQuery('(min-width: 1024px)')` from `src/app/lib/useMediaQuery.ts`, the one place where behaviour rather than styling depends on the viewport: a drawer that has not been opened cannot be a class on an element that must not be in the DOM yet, so the breakpoint is read in JS instead.

A profile puts the avatar on the left of the counts — posts, followers and following — with the name and bio under them, and its media tab is a three-column grid of square tiles rather than two columns of fixed-height ones. The posts number is the profile resource's own `postCount`, which the backend computes through the feed's visibility fragment, so it always equals the posts the profile can actually show that viewer; it is deliberately not `posts.items.length`, which is only the pages loaded so far.

Every picture the app renders goes through `mediaImageProps` in `src/app/lib/mediaVariants.ts`: it asks the server for the 480 px thumbnail and the 1600 px large version of one media URL and lets the browser choose with `sizes`, which is why a feed no longer downloads 12-megapixel originals. The `sizes` string is the caller's, because only the caller knows the box the picture is drawn in; a URL that is not this application's media is returned untouched. The full-screen story view is deliberately left on the original rather than on a derivative.

The composer explains itself rather than disabling its button: it names what a publish is still missing ("Add 4 more characters (at least 10).", "Choose at least one follower.") beside the publish button, attaches that reason to the field with `aria-describedby`, and moves the caret there when a publish is refused. The action row is sticky, and Ctrl/Cmd + Enter publishes from the textarea. An unsent post is saved to `localStorage` under `social:post-draft` — keyed to a new post only, cleared when one is published or when Discard is pressed — and what comes back after a refresh is the text and the audience, never the photos, which the notice on screen says. Lists grow as you scroll: `LoadMore` presses its own button for you when the end of the list comes into view, one page is in flight at a time, and a throttle window keeps a fast scroll from queueing repeat requests. Chat typing and live refreshes are throttled. The preview panel beside the form draws the draft the way the feed card will, and its audience banner says who can read it in words — `audienceSummary` in `src/app/api/social.ts`, written against the server's `postVisibility` clause rather than against the three labels, so a public post from a private profile is worded as reaching only that profile's followers.

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
node scripts/dead-modules.mjs
```

`dead-modules.mjs` resolves every relative import in `src` to its target and reports
the modules nothing imports, skipping Next.js route files, which are entry points by
convention. Spot-checking for dead files missed them twice here — a component whose
only importer is itself dead reads as "used" if the check is done by name — so it is
worth running after deleting anything.

One check on this side runs from the other one: `cd backend && go test ./pkg/app/handlers/`
reads `src/app/lib/mediaLimits.ts` and fails by name when its ceilings disagree with the
constants the server enforces, so raising a limit means changing both files in one commit.
It is part of `go test ./...`, which the release list runs anyway.

The integration command builds and starts temporary backend and frontend servers
on available ports, seeds a separate database, and drives two headless Chrome
sessions through the UI. It does not use your development database. Chrome must
be installed; set `CHROME_PATH` if it is outside the usual location for your
platform.
Logs, the test database, and screenshots remain in `backend/tmp/integration-*`.
The temporary servers stop when the check finishes. Go uses `backend/tmp/go-build`
for its cache unless `GOCACHE` is already set. The frontend it starts builds into
`frontend/.next-smoke`, which `run-integration.mjs` sets through `NEXT_DIST_DIR`
so the check never disturbs your development build in `frontend/.next`. That
directory is a cache, not state: delete it whenever you want the space back and
the next run recreates it (the first run after that is slower).
