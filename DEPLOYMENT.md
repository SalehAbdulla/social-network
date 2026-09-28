# Deployment

Run `docker compose up --build -d` from the repository root and open http://localhost:4000. Register an account on the login page. Demo authentication is disabled. SQLite and uploaded media persist in the `social-data` named volume; migrations run automatically at backend startup. Stop with `docker compose down` (do not add `-v` unless intentionally deleting all application data).

The backend and frontend have separate Docker images and run as unprivileged users. Only the frontend is exposed, bound to loopback. The frontend proxies API requests and WebSocket upgrades to the backend. `BACKEND_URL` is compiled into the frontend rewrites: rebuild the frontend image when changing the backend address.

## Production configuration

Put an HTTPS reverse proxy in front of port 4000, preserve the Host and Origin headers, and support WebSocket upgrades at `/ws`. Set `APP_ENV=production` and `FRONTEND_ORIGIN=https://your-domain.example` in a root `.env` file before starting Compose. Production uses Secure, HttpOnly, SameSite=Lax cookies; plain HTTP production login will not work. Keep the backend inaccessible from the public internet. Local Compose defaults to development cookie transport to support localhost HTTP, with demo sessions still disabled.

| Backend variable | Purpose |
| --- | --- |
| `APP_ENV` | `production` enables Secure cookies and disables demo authentication |
| `FRONTEND_ORIGIN` | Exact public browser origin, without a trailing slash |
| `DATABASE_PATH` | Writable SQLite file; default is backend/pkg/db/socialnetwork.db |
| `UPLOAD_DIR` | Writable upload directory |
| `PORT` | Listening port, default 5174 |
| `LOG_LEVEL` | Logging verbosity |

The frontend container listens on port 4000. Sessions are stored in the `session` table, so they survive a backend restart. A session expires after 14 days without activity or 30 days after login, whichever comes first, and is revoked by logout or a subsequent login; expired rows are pruned at startup and then hourly. Session state is therefore shared through the database, but SQLite still serialises writers: run one backend instance and move to a server database before scaling out.

Application request limits are 20 login/register attempts and 1,200 other requests per minute per direct peer. Because Next.js proxies requests, deploy additional per-client rate limiting at the public reverse proxy. Do not trust arbitrary client-supplied forwarding headers: Next.js only fills in `X-Forwarded-For` when the client did not send one, so a forged value survives and would hand an attacker a rate-limit bypass.

Login attempts are therefore also counted per account, which is what the peer limit cannot do behind the proxy: after 10 failed sign-ins for the same identifier the account is answered 429 with `Retry-After` for 15 minutes, while every other account keeps signing in. Only failures count and a successful sign-in clears them, so a member who mistypes a password is not left throttled, and an identifier that no account owns locks in exactly the same way so the lock cannot be used to discover which addresses are registered. Registration is not locked per account: there is no password to guess, duplicate emails are refused, and the peer limit covers bulk sign-ups.

API responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and `Cache-Control: no-store`. The backend deliberately does not send HSTS or a document CSP: those belong where the browser reads an HTML document, so set them on the public reverse proxy (or in `next.config.ts` `headers()`) together with the frontend. Requests that mutate state are protected by the `SameSite=Lax` session cookie plus an `Origin` (or `Sec-Fetch-Site`) check that rejects any non-GET request from another origin, which is why no CSRF token is issued: every mutating endpoint is JSON or form-encoded and reachable only with that cookie.

API bodies are limited to 1 MiB except uploads (51 MiB); configure the proxy to allow that upload size and a suitable upload timeout.

Uploads are stricter than that body limit. A JPEG, PNG, GIF or WebP image may be at most 10 MB and a video at most 50 MB, and an image may not exceed 40 megapixels. The type is taken from the bytes, never from the filename or the client's `Content-Type`: a `photo.png` holding GIF bytes is stored and served as `image/gif`, and an HTML or PDF payload wearing an image extension is refused with `400` because the sniffed type is not on the allowed list. An empty file is a `400` too, while anything over a size ceiling is answered `413`, which says the request was well formed and simply too large; both bodies carry a message naming the limit so the client can show it. Uploaded media is referenced by URL from posts, comments, stories, messages, group content, avatars, cover photos and group images, and nothing unlinks it when the referencing row is deleted, so a collector removes media rows nothing points at together with their files, and lets an upload that was never attached expire. It runs at startup and then hourly with a 24-hour grace window (an upload is always followed by the request that attaches it, so the window only has to outlast a slow form), and logs how many rows and files it reclaimed. Expired stories release their media too, because a story past `expiresAt` can never be served again. Expect storage for a deleted post, comment, story or message to be reclaimed within a day.

## Backup and restore

Everything the `social-data` volume holds is two things: `/data/socialnetwork.db` and `/data/uploads`. A backup is only complete with both, because a media row without its file serves a 404 while a file without its row is unreachable and gets swept.

On a host, copy the database with SQLite's own backup API rather than `cp` — a plain copy of a live database can catch a torn page — and copy the uploads beside it:

```sh
sqlite3 /data/socialnetwork.db ".backup '/backup/socialnetwork.db'"
cp -R /data/uploads /backup/
```

`scripts/backup-restore-drill.sh` runs that cycle end to end against a throwaway directory: build, create an account with a photo uploaded onto a post, back up the live database and the uploads, stop the server, wipe the volume, restore, restart, and assert that the account, the session cookie made *before* the wipe, the post, the photo and its exact bytes all come back. It passed on 2026-09-28 with `users,posts,media,sessions = 1,1,1,1` and one upload file, asserting the restored rows and files match the pre-wipe counts. Run it before a release that touches the schema, and again after any restore rehearsal.

Inside Docker the same two steps apply to the volume, but the backend image deliberately ships without an `sqlite3` binary, so run the CLI from a throwaway container with the volume mounted:

```sh
docker compose stop backend
docker run --rm -v social-data:/data -v "$PWD/backup:/backup" alpine:3.20 \
  sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /data/socialnetwork.db ".backup /backup/socialnetwork.db"'
docker run --rm -v social-data:/data -v "$PWD/backup:/backup" alpine:3.20 cp -R /data/uploads /backup/
docker compose start backend
```

**Recorded rather than hidden:** the host drill above was executed and passed; the Docker sequence has not been run, because the environment that produced this document has no Docker daemon. Treat it as reviewed-but-unverified until it is run on a Docker host. Stopping the writer first is what makes the uploads copy safe, while the database copy uses `.backup` and stays consistent either way.

Test a restore before a release, take a backup before applying new migrations, never delete the volume to upgrade (rebuild and restart the images), and roll back only with a compatible schema or a tested backup restore.

## Release checks

`.github/workflows/ci.yml` runs this list on every push and pull request, so it doubles as the pipeline: Go `build`, `vet`, `test` and `govulncheck` for the backend; `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build` and a reported `npm audit` for the frontend; then `docker compose config` and `docker compose build`. By hand:

```sh
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build
cd frontend && npm run test:integration
```

Browser tests require Chrome (`CHROME_PATH` overrides its executable path). They create an isolated database under backend/tmp and leave logs/screenshots there. They are not part of CI yet: they need a Chrome path on the runner and several minutes, which the workflow keeps separate for now.

### Dependency advisories

`govulncheck ./...` reports three standard-library findings (`crypto/tls`, `net/http` in an unencrypted HTTP/2 protocol check, and `encoding/asn1` recursion), all fixed in **go1.26.6**. Both the Dockerfile base image (`golang:1.26-bookworm`) and CI install a current 1.26 patch, so rebuilding with an up-to-date toolchain clears them; pinning an older Go patch would keep them, which is why the workflow floats the patch version and CI runs `govulncheck` as a blocking step.

`npm audit` is clean — 0 vulnerabilities — since the framework bump of 2026-09-28, which moved Next.js from 16.2.12 to **16.3.6** and carried `postcss` and `sharp` with it; the two highs it still showed (`js-yaml`, `nanoid`) were cleared by an in-range `npm audit fix`. It had previously reported four high and one critical, all inside Next.js tooling, with no fix available inside the pinned range. The bump was verified the same day with the full browser suite (24 steps, no runtime exceptions) and a production build, and CI now enforces `npm audit --audit-level=high` rather than only reporting it. Both Next.js packages stay pinned exactly, as they were.

Security reference: [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
