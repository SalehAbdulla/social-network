# Social Network frontend

The Next.js frontend calls the Go backend through the same origin. API requests
to `/api/v1/*`, uploaded media, and the `/ws` WebSocket are proxied to `BACKEND_URL`.
The browser sends the backend's HTTP-only session cookie with these requests.

## Run locally with the demo users

From `backend`, start the demo backend in one terminal:

```powershell
.\dev.cmd
```

On Ubuntu / WSL, use `sh ./dev.sh` instead.

This creates Dummy User and Alex Demo if they do not already exist, enables demo
sessions, and starts Go on port 5174. Existing accounts and their data are kept.
Go and a C compiler are required; the script detects GCC at
`C:\msys64\mingw64\bin` on Windows.

In `frontend/.env`, keep your existing keys and add:

```dotenv
NEXT_PUBLIC_DEV_USER=true
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

Open **http://localhost:4000** and sign in with `dummy@example.com` and
`DummyUser123!`. Once signed in, use the **Development user** selector at the
bottom of the sidebar to switch to Alex Demo. Anonymous page visits and expired
sessions redirect to login, including in demo mode. Restart Next.js after
changing its environment settings. If Go restarts, sign in again.

Use separate browser profiles or a private window to interact as both users.
The backend allows one session per account; a fresh login for the same account
invalidates its previous session. Select a different demo user in each window
and sign in again in the first window if needed.

The connected screens cover posts, comments, reactions, uploaded images, profiles,
stories, discovery, follows, connection requests, notifications, and chat with
typing, read receipts, attachments, editing, and deletion. Follow and connection
changes update both users over WebSocket. Comment notifications open their post.

Demo sessions are available only in development, with `DEV_DUMMY_USER=true` on
Go and `NEXT_PUBLIC_DEV_USER=true` on Next.js. Login and registration use the
backend's session authentication regardless of whether demo switching is enabled.

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
