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

Application request limits are 20 login/register attempts and 1,200 other requests per minute per direct peer. Because Next.js proxies requests, deploy additional per-client rate limiting at the public reverse proxy. Do not trust arbitrary client-supplied forwarding headers. API bodies are limited to 1 MiB except uploads (51 MiB); configure the proxy to allow that upload size and a suitable upload timeout.

Back up the database using SQLite's backup API or stop the backend before copying `/data`; include uploads in the same backup. Test restoring a backup before release. Back up before applying new migrations. Do not delete the volume to upgrade: rebuild and restart the images. Roll back the application only with a compatible schema or a tested backup restore.

## Release checks

Run `go test ./...` and `go vet ./...` from backend; run `npm ci`, `npm run lint`, `npm run build`, and `npm run test:integration` from frontend. Browser tests require Chrome (`CHROME_PATH` overrides its executable path). They create an isolated database under backend/tmp and leave logs/screenshots there. Run `npm audit` and `govulncheck ./...` for dependency advisories, and `docker compose config` plus `docker compose build` to verify containers on a Docker host.

Security reference: [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
