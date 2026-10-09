# Deployment

Run `docker compose up --build -d` from the repository root and open http://localhost:4000. The frontend waits for the backend's healthcheck before it starts, so the first request is not answered while migrations are still running. Register an account on the login page. Demo authentication is disabled. SQLite and uploaded media persist in the `social-data` named volume; migrations run automatically at backend startup. Stop with `docker compose down` (do not add `-v` unless intentionally deleting all application data).

The backend and frontend have separate Docker images and run as unprivileged users. Only the frontend is exposed, bound to loopback. The frontend proxies API requests and WebSocket upgrades to the backend. `BACKEND_URL` is compiled into the frontend rewrites: rebuild the frontend image when changing the backend address. A production build refuses to guess it — with the variable unset it stops with an error instead of compiling a loopback address into a container that cannot reach it, and it also refuses a value that is not an http(s) URL or that ends with a slash. Both CI workflows pass a placeholder, because a build never exercises the rewrites.

## Production configuration

Put an HTTPS reverse proxy in front of port 4000, preserve the Host and Origin headers, and support WebSocket upgrades at `/ws`. `deploy/Caddyfile.example` is a worked sample: it terminates TLS, forwards to the loopback-bound frontend, lets the upgrade headers through, and sets the document-level headers this app deliberately does not send (HSTS and a CSP for the app itself). It is **reviewed rather than executed** — the environment that wrote it has neither a `caddy` binary nor a Docker daemon — so run `caddy validate --config deploy/Caddyfile.example` before trusting it, and treat the CSP as a starting point, since Next.js injects inline bootstrap scripts. Add per-client rate limiting at that layer too: the app's own limits are per direct peer, and every request behind the proxy arrives from one address. Set `APP_ENV=production` and `FRONTEND_ORIGIN=https://your-domain.example` in a root `.env` file before starting Compose. Production uses Secure, HttpOnly, SameSite=Lax cookies; plain HTTP production login will not work. Keep the backend inaccessible from the public internet. Local Compose defaults to development cookie transport to support localhost HTTP, with demo sessions still disabled.

| Backend variable | Purpose |
| --- | --- |
| `APP_ENV` | `production` enables Secure cookies and disables demo authentication |
| `FRONTEND_ORIGIN` | Exact public browser origin, without a trailing slash |
| `DATABASE_PATH` | Writable SQLite file; default is backend/pkg/db/socialnetwork.db |
| `UPLOAD_DIR` | Writable upload directory |
| `PORT` | Listening port, default 5174 |
| `LOG_LEVEL` | Logging verbosity |

## Co-hosted deploy on the Oracle VPS

Production for this project runs on the same Oracle Cloud **Always Free** `VM.Standard.A1.Flex`
(ARM64, Ubuntu) that already hosts `beyond`, rather than on a host of its own. The two stacks are
kept independent — `docker compose ls` shows `beyond` and `social-network` as separate projects:

| Concern | How it is kept separate |
| --- | --- |
| Compose project | `name: social-network` in `compose.prod.yaml` — its own project, network and volume |
| Data | the `social-network-data` volume (SQLite + uploads); never shared with `beyond` |
| Public ports | **none** — `beyond-nginx` already owns 80/443 |
| Ingress | our frontend joins beyond's `beyond-prod` network under the alias `social-network-frontend`, and a site block in beyond's nginx proxies the hostname to it (`deploy/nginx-social.conf`) |
| Loopback probe | the frontend also listens on `127.0.0.1:4100` for health checks and debugging |
| Logs | every service caps its logs — unbounded json-file logs once filled this host's disk and took `beyond` down |

**`BACKEND_URL` is a unique alias, not `backend`.** Our frontend sits on two networks, and `beyond`
also has a service called `backend`; the plain name would resolve to *their* Spring Boot app about
half the time. The build arg is therefore `http://social-network-backend:5174`, which exists only on
our own network.

### One-time setup (already applied — recorded here)

1. **DNS** — a free DuckDNS subdomain, **`salehsocial.duckdns.org`**, with its `A` record pointing at
   the VPS (`84.13.131.23`). DuckDNS is on the Public Suffix List, so Let's Encrypt issues for it over
   the ordinary HTTP-01 webroot flow.
2. **Certificate** — our **own** certificate, separate from beyond's:
   ```sh
   sudo certbot certonly --webroot -w /home/ubuntu/beyond/docker/nginx/certbot-webroot \
     --non-interactive --agree-tos -m info@beyondedubh.com -d salehsocial.duckdns.org
   ```
   The first issuance needs no site block: with no `server_name` match, nginx falls back to beyond's
   default port-80 server, which already serves the same ACME webroot.
3. **Certificate files** — copied in under their **own** names. beyond's server blocks use
   `/etc/nginx/ssl/fullchain.pem` + `privkey.pem` for *every* beyondedubh.com host, so writing our
   cert over those names would break all of them:
   ```sh
   sudo cp /etc/letsencrypt/live/salehsocial.duckdns.org/fullchain.pem ~/beyond/docker/nginx/ssl/salehsocial-fullchain.pem
   sudo cp /etc/letsencrypt/live/salehsocial.duckdns.org/privkey.pem  ~/beyond/docker/nginx/ssl/salehsocial-privkey.pem
   sudo chown ubuntu:ubuntu ~/beyond/docker/nginx/ssl/salehsocial-*.pem
   chmod 644 ~/beyond/docker/nginx/ssl/salehsocial-*.pem   # 600 fails: nginx runs as another uid
   ```
4. **Renewal hook** — `deploy/certbot-deploy-hook.sh` installed as
   `/etc/letsencrypt/renewal-hooks/deploy/social-network-nginx.sh` (root, `+x`). Deploy hooks are
   **global**, so it exits quietly when our cert is absent and never writes beyond's files.
5. **nginx site block** — validate *before* reloading, so a typo cannot take `beyond` down:
   ```sh
   cp deploy/nginx-social.conf ~/beyond/docker/nginx/sites/social.conf
   docker exec beyond-nginx nginx -t && docker exec beyond-nginx nginx -s reload
   ```
6. **Env** — `cp .env.example.prod .env.prod` and fill it in (`.env.prod` is git-ignored). Set
   `FRONTEND_ORIGIN=https://salehsocial.duckdns.org`, then `docker compose ... up -d` to apply it.
7. **Actions** — secrets `PROD_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`; optionally the variables
   `PROD_APP_DIR` (default `~/social-network`) and `SITE_HOST` (default `salehsocial.duckdns.org`).

### Deploying

`.github/workflows/deploy-prod.yml` runs on a **GitHub-hosted** runner (not the self-hosted runner on
the VPS, which belongs to `beyond`) and pushes over SSH. It fires on a `v*` tag or by hand:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

The job checks free disk, **backs up the volume before migrations run**, builds the ARM images on the
host, then gates on `127.0.0.1:4100/api/v1/ready` (through the frontend, so the rewrite is exercised)
and finally on the public HTTPS readiness endpoint.

### Two limits worth stating

- **Disk is shared and was at ~72%.** The root volume also holds `beyond` and its CI runner. The
  workflow refuses to build with under 5 GB free and prunes dangling images afterwards, but the build
  still needs a few GB while it runs.
- **The reverse proxy and its TLS are shared.** beyond's nginx terminates TLS for every hostname on
  this box, so a broken site block — or a certificate written over `fullchain.pem` — is a `beyond`
  outage. That is why our cert uses its own filenames, the renewal hook is guarded, and every change
  runs `nginx -t` before the reload.


`POST /api/v1/auth/password-reset` starts the flow and `POST /api/v1/auth/password-reset/confirm` redeems the link. The first is the only endpoint in this API that answers the same way whether or not the address exists — `202` with one sentence either way — because "no such account" is a registration oracle. Tokens are 256 random bits and the table stores only a sha256 of one, so a leaked database does not hand over working links. A link is single-use, expires after **30 minutes**, and requesting a new one invalidates the previous link. Redeeming stores the new hash and revokes **every** session the account had, so the visitor signs in again rather than being handed a session by whoever clicked the link. Requests are limited to three per address per fifteen minutes, counted for unknown addresses too: a limit that applied only to registered ones would answer the question the endpoint refuses to answer.

Delivery is configured with SMTP; without a provider the endpoint answers `503` rather than accepting a request whose link will never arrive.

| Backend variable | Purpose |
| --- | --- |
| `SMTP_HOST` | Setting it is what enables reset mail; the others are ignored without it |
| `SMTP_PORT` | Defaults to 587 |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | Optional. When set, the server must offer AUTH or the send is refused rather than quietly downgraded to unauthenticated |
| `SMTP_FROM` | Defaults to `no-reply@$SMTP_HOST` |

STARTTLS is used whenever the server advertises it. In development (`APP_ENV` unset) the mailer writes the message to the application log instead, which is how the browser suite completes the flow — and that is precisely why production never constructs that mailer: a reset link in a log file is a working credential in a log file.

Two limits are recorded rather than hidden. Delivery has been exercised against an in-process SMTP stub and against a refused connection, **not** against a real provider, so the first deployment with credentials is the real test. And the answer is uniform in status and body but not in timing — a known address writes a row and talks to a mail server, an unknown one does neither — which is left alone because padding every request with fake latency would slow everyone down to hide a weak signal.


The frontend container listens on port 4000. Sessions are stored in the `session` table, so they survive a backend restart. A session expires after 14 days without activity or 30 days after login, whichever comes first, and is revoked by logout, by a subsequent login, or by a password change; expired rows are pruned at startup and then hourly. A password change is the one credential transition the app has — there is no role or permission system to rotate on — so `PUT /api/v1/users/me/password` verifies the current password, stores the new hash, and then rotates the session, which deletes every other session row of that account in the same transaction and hands the replacement cookie to the browser that asked. The replacement cookie is deliberately not persistent, so a remembered login has to be re-established on that browser. An account whose other browser is signed out this way loses its API access on its next request; its open WebSocket closes at that point too, because the client's session-expired handler clears the signed-in user and drops the socket. Session state is therefore shared through the database, but SQLite still serialises writers: run one backend instance and move to a server database before scaling out.

Application request limits are 20 login/register attempts and 1,200 other requests per minute per direct peer. The boundary is tested rather than assumed: `backend/tests/load_smoke_test.go` sends a full window's worth of requests and checks that the twelve-hundredth is answered and the next is refused with `Retry-After`, so the off-by-one cannot drift unnoticed. Set `RATE_LIMIT_PER_MINUTE` to move the peer ceiling for one instance; it defaults to 1,200, and a value that is absent, unparseable or not positive falls back to that default rather than to no limit, so the tested boundary is what an unconfigured deployment gets. `frontend/scripts/run-integration.mjs` raises it because the browser suite is one machine driving every step from a single peer. The login/register budget and the per-account lockout below are not configurable. The same file loads the realtime path — fifty signed-in members connected at once, every one of which has to receive the same group broadcast, delivered in about 2 ms — and measures sustained throughput across eight workers (about 6,700 requests a second against a local SQLite, reported rather than asserted, because a wall-clock threshold fails in CI for reasons unrelated to the code). Because Next.js proxies requests, deploy additional per-client rate limiting at the public reverse proxy. Do not trust arbitrary client-supplied forwarding headers: Next.js only fills in `X-Forwarded-For` when the client did not send one, so a forged value survives and would hand an attacker a rate-limit bypass.

Login attempts are therefore also counted per account, which is what the peer limit cannot do behind the proxy: after 10 failed sign-ins for the same identifier the account is answered 429 with `Retry-After` for 15 minutes, while every other account keeps signing in. Only failures count and a successful sign-in clears them, so a member who mistypes a password is not left throttled, and an identifier that no account owns locks in exactly the same way so the lock cannot be used to discover which addresses are registered. Registration is not locked per account: there is no password to guess, duplicate emails are refused, and the peer limit covers bulk sign-ups.

API responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and `Cache-Control: no-store`. The backend deliberately does not send HSTS or a document CSP: those belong where the browser reads an HTML document, so set them on the public reverse proxy (or in `next.config.ts` `headers()`) together with the frontend. Requests that mutate state are protected by the `SameSite=Lax` session cookie plus an `Origin` (or `Sec-Fetch-Site`) check that rejects any non-GET request from another origin, which is why no CSRF token is issued: every mutating endpoint is JSON or form-encoded and reachable only with that cookie.

API bodies are limited to 1 MiB except uploads (51 MiB); configure the proxy to allow that upload size and a suitable upload timeout.

Uploads are stricter than that body limit. A JPEG, PNG, GIF or WebP image may be at most 10 MB and a video at most 50 MB, and an image may not exceed 40 megapixels — checked from the file's own header for every allowed format, WebP included, which is what stops a decompression bomb: a few dozen bytes can declare a canvas far larger than any real photo, and the byte ceiling says nothing about that. The type is taken from the bytes, never from the filename or the client's `Content-Type`: a `photo.png` holding GIF bytes is stored and served as `image/gif`, and an HTML, SVG or PDF payload wearing an image extension is refused with `400` because the sniffed type is not on the allowed list. An empty file is a `400` too, while anything over a size ceiling is answered `413`, which says the request was well formed and simply too large. The body names the limit, and for the image ceiling the file's own measured size with it — `Image is 12.4 MB; the limit is 10 MB.` — because that is the sentence the composer's toast shows verbatim and the one a reader can act on. The 50 MB gate keeps the limit alone: it runs before the type is sniffed and the request ceiling is that number plus a megabyte, so a measured size there could only read as the ceiling itself. The browser applies the same ceilings before it uploads, from `frontend/src/app/lib/mediaLimits.ts`, and `backend/pkg/app/handlers/media_limits_test.go` reads that module and compares it against the constants enforced here, so the two sides can only be changed together; it checks the numbers, not the wording, and not this document.

Every image that can be resized is also stored twice more, as a 480 px `_thumb` and a 1600 px `_large` file beside the original, and `GET /api/v1/media/{id}?size=thumb|large|original` serves whichever is asked for — falling back to the original when the derivative does not exist (a row that predates this, a GIF, a video, a picture already narrower than a cap). Two costs belong here rather than in a comment: **disk** grows by roughly a third for a photo library, since the thumbnail and the large version are kept as well as the original, and **an upload is slower** because the resize happens in the request — a 12-megapixel photo decodes to about 140 MB of pixels while it is resized, and the 40-megapixel ceiling is what bounds that. Nothing reclaims the derivatives individually: the collector removes them with the original, which is why a `_thumb` file never outlives its row. Uploaded media is referenced by URL from posts, comments, stories, messages, group content, avatars, cover photos and group images, and nothing unlinks it when the referencing row is deleted, so a collector removes media rows nothing points at together with their files, and lets an upload that was never attached expire. It runs at startup and then hourly with a 24-hour grace window (an upload is always followed by the request that attaches it, so the window only has to outlast a slow form), and logs how many rows and files it reclaimed. Expired stories release their media too, because a story past `expiresAt` can never be served again. Expect storage for a deleted post, comment, story or message to be reclaimed within a day.

Serving media holds the stored type to the same six-type allow-list the upload used. A media row whose type is anything else is handed over as `application/octet-stream` with `Content-Disposition: attachment` and `nosniff` instead of being served as itself, so a row written by an import, a migration or a bug can never be rendered inline. Ordinary rows are unaffected: images and video still render inline, which is why `Content-Disposition: attachment` is not applied to them — post photos, avatars, covers, story media and group images are all displayed by the page. Story media is the one thing with no audience rule: a live story is readable by any signed-in member. That is a recorded decision rather than an oversight (the spec's story requirement names no privacy, and the listing and the media rule agree by keying on expiry alone); giving stories an audience would mean an audience column, a branch in `CanViewMedia`, a change to how expiry releases their uploads, and the UI to choose one.

One more periodic job runs every five minutes: group event reminders. It looks for group events starting inside the next hour that have not been reminded about yet and notifies the members who answered *going* — never the event's author, and never anyone who declined. The event row is stamped before the notifications go out and only an unstamped row can be stamped, so the sweep is safe to repeat: a second pass, or a second instance, finds nothing to do rather than sending the reminder twice. The trade is deliberate and worth knowing: a crash between the stamp and the last notification loses that one reminder instead of duplicating it.

## Health and readiness

The backend answers two unauthenticated probes. Both sit under `/api/v1`, so the same URL answers
directly and through the frontend proxy — which is the path a browser actually takes.

| Probe | What it claims | Answer |
| --- | --- | --- |
| `GET /api/v1/health` | The process is up and serving. It never touches the database. | `200 {"success":true,"data":{"status":"ok"}}` |
| `GET /api/v1/ready` | The process can answer requests that need the database; it pings SQLite with a 2-second ceiling. | `200 {"data":{"status":"ready"}}`, or `503 {"success":false,"error":"database unreachable","code":503}` |

Neither probe needs a session, because a healthcheck runs inside the container and has no cookie to
offer. Both are read-only `GET`s and go through the same per-peer limit as every other route.

Both images carry a `HEALTHCHECK` that calls `/api/v1/ready` every 10 seconds (3-second timeout, 5
retries, 20-second start period on the backend and 30 on the frontend). That is what
`docker compose up` gates on: the frontend's `depends_on` uses `condition: service_healthy`, so it
starts once the backend has finished migrating and can answer a database-backed request instead of
starting blind beside it. The frontend's own probe goes through its rewrite to the backend's
readiness endpoint, so it only passes when the whole chain works — frontend serving, proxy
forwarding, backend answering. `curl` is the one package those probes add to the images.

Two consequences worth knowing. Liveness and readiness are deliberately different, so a container
whose database stops answering is reported unhealthy without being killed: restarting the process
would not bring the database back. And every probe is logged like any other request, so a
10-second interval adds six lines a minute to the backend log.

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

## Release checklist

Work through this in order. The order is the point: the backup has to be taken before anything runs
migrations, and the verification has to happen while the previous version is still available to roll
back to. Each step names the command that answers it, so a release can be rehearsed rather than
remembered.

1. **Green tree, on the release commit.**
   ```sh
   cd backend  && go build ./... && go vet ./... && go test ./...
   cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build
   ```
   These are the checks in *Release checks* below, and the same four jobs run them in
   `.github/workflows/ci.yml` and `.gitlab-ci.yml`. A red check stops the release.

2. **Back up, with the writer stopped.** Migrations run at backend startup, so a backup taken after
   the new image starts is a backup of a schema the release has already changed.
   ```sh
   docker compose stop backend
   docker run --rm -v social-data:/data -v "$PWD/backup:/backup" alpine:3.20 \
     sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /data/socialnetwork.db ".backup /backup/socialnetwork.db"'
   docker run --rm -v social-data:/data -v "$PWD/backup:/backup" alpine:3.20 cp -R /data/uploads /backup/
   ```
   Both halves, always — the database alone leaves the posts pointing at media that is gone. A
   backup nobody has ever restored is a hope, so rehearse the cycle with
   `scripts/backup-restore-drill.sh` before any release that touches the schema, and read the caveat
   at the end of *Backup and restore* about what that drill does not cover.

3. **Images build.** `docker compose config && docker compose build`. This is cheap, and it fails
   loudly here rather than while you are trying to roll back.

4. **Deploy.** `docker compose up -d`. Migrations run automatically at backend startup and the
   frontend waits for the backend's healthcheck, so a browser is never pointed at a half-migrated
   API. The backend log shows the migration lines on a first boot against a new volume.

5. **Verify.** `curl -fsS http://127.0.0.1:4000/api/v1/ready` must answer `200` — that is the same
   probe the containers use, and it fails if the database is unreachable. Then, in a browser as a
   real member: sign in, publish a post with a photo, open a chat and send a message, and watch the
   notification badge. That one pass covers the database, the media path, the WebSocket upgrade
   through the proxy and the push path. `docker compose logs -f backend` should show those requests
   with no error lines.

6. **Rollback** is two halves, and the second is the one that gets forgotten. Stop the new stack
   (`docker compose down`), check out the previous release tag, then `docker compose up --build -d`.
   If the release had already written data under a new migration, redeploying the old code is not
   enough: the old binary expects the old schema, so restore the step-2 backup as well. Never
   "roll back" by deleting the volume — that is data loss, not rollback. Roll back on a failing
   `/api/v1/ready`, a failed step 5, or a run of 5xx or 429 in the log that step 5 did not explain.

## Release checks

`.github/workflows/ci.yml` runs this list on every push and pull request, so it doubles as the pipeline: Go `build`, `vet`, `test` and `govulncheck` for the backend; `npm ci`, `npm run lint`, `npm run build`, `npx tsc --noEmit` and a blocking `npm audit --omit=dev` for the frontend; then `docker compose config` and `docker compose build`. `scripts/pin-base-images.mjs` runs there too (`base-images`) and only reports, for the reason given under base image pins below. By hand:

```sh
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm run build
cd frontend && npm run test:integration
node scripts/pin-base-images.mjs
```

Of the container checks, `docker compose config` has been run against this file (2026-09-30, exit 0: it renders both services, the `service_healthy` gate, the loopback-only port binding and the named volume). `docker compose build` and `docker compose up` have since been executed end to end (2026-10-08) on an Apple Silicon host under **colima**, with no Docker daemon installed on the host itself: both images build from their pinned digests, both containers come up `(healthy)` with non-zero sizes, migrations run at backend boot, and the browser suite passes 9/9 against the stack on `http://localhost:4000`. The one thing that fought back was the network rather than the images: it drops DNS for Docker Hub and `proxy.golang.org` intermittently, so the build had to be retried — Docker caches every finished layer, so retries make progress instead of starting over.

Browser tests require Chrome (`CHROME_PATH` overrides its executable path; the fallbacks are the usual install locations per platform, so a Linux host normally has to set it). They create an isolated database under backend/tmp and leave logs/screenshots there. Both CI files carry the job as **opt-in** rather than on every run — `browser`, manual in GitLab and `workflow_dispatch`-only on GitHub — because it takes several minutes and needs three things in one container: Go (the harness shells out to `go build`), a C compiler (the SQLite driver is CGO) and a Chrome binary. It has not been executed on a runner yet: it is written and reviewed, not verified, which is exactly why it is opt-in rather than a gate.

### Dependency advisories

`govulncheck ./...` reports three standard-library findings (`crypto/tls`, `net/http` in an unencrypted HTTP/2 protocol check, and `encoding/asn1` recursion), all fixed in **go1.26.6**. CI installs a current 1.26 patch, already clears them, and runs `govulncheck` as a blocking step, so the check is what would catch a regression.

### Base image pins

Every upstream image this repository builds on or runs on is pinned by tag *and* digest: `golang:1.26-bookworm@sha256:…` and `debian:bookworm-slim@sha256:…` in `backend/Dockerfile`, `node:22-bookworm-slim@sha256:…` in `frontend/Dockerfile`, and the Go, Node and Docker images in `.gitlab-ci.yml` — including the one the pin check itself runs on. The pinned digest is the multi-arch index rather than a per-architecture manifest, so one pin resolves on amd64 (CI) and on arm64 (an Apple-silicon laptop).

The Dockerfiles used to float their Go patch deliberately, because a current patch is what clears the standard-library findings above. A digest freezes the patch, so the float has been replaced by a pin plus something that notices when the pin is behind:

```sh
node scripts/pin-base-images.mjs           # 0 current, 1 drift, 2 cannot resolve
node scripts/pin-base-images.mjs --write   # rewrite the pins in place
```

It resolves each tag against Docker Hub and prints the toolchain it carries, read out of the image config, which turns "pinned at an opaque digest" into "pinned at go1.26.8 / node22.23.3 / docker27.5.1" — the version that has to be at or above the fix. A drifted pin prints both sides (`(golang1.26.8)  was (golang1.26.7)`). The `base-images` job runs the check in both CI files and only **reports**, because a new upstream patch is not a defect in the commit that notices it: refresh on that report, or monthly, whichever comes first.

Two limits, stated rather than implied. The check needs Docker Hub reachable; exit code 2 means it could not resolve and nothing was changed, and a **429** from Docker Hub's anonymous-pull cap is reported as exactly that rate limit rather than as a failed resolution — it hit this repository during the session that added the pins. And the pinned digests have since been used by a real `docker build` (2026-10-08, colima on Apple Silicon): every `FROM` pulled from its pinned digest, so the pins are verified to *build*, not merely to resolve.

`npm audit` runs against the dependencies that ship — `npm audit --omit=dev --audit-level=high`, blocking. It was clean (0 vulnerabilities) after the framework bump of 2026-09-28, which moved Next.js from 16.2.12 to **16.3.6** and carried `postcss` and `sharp` with it (the two highs it had still shown, `js-yaml` and `nanoid`, cleared by an in-range `npm audit fix`). New advisories later appeared: another in-range `npm audit fix` moved `source-map-js` to 1.2.2 — the one production finding, reached through `postcss` — and `brace-expansion` to its patched releases, which clears the production tree again. One dev-tooling advisory cannot be cleared and is why the gate is scoped with `--omit=dev`: `braces@3.0.3`, reached through `eslint-config-next` → `fast-glob` → `micromatch`, is the latest published version and carries no fix. Both Next.js packages stay pinned exactly, as they were.

Security reference: [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
