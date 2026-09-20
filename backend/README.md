# Backend

Run `sh ./dev.sh` (Linux/macOS/WSL) or `.\dev.cmd` (Windows). Go and a C compiler are required for SQLite. The server listens on port 5174; `PORT` overrides it.

Register an account in the frontend, then sign in normally. Startup does not seed development users, and there is no development session endpoint or password-free account switching. The seed command is only used explicitly by isolated integration test fixtures.

`DATABASE_PATH` selects the SQLite database, `UPLOAD_DIR` selects file storage, and `FRONTEND_ORIGIN` selects the browser origin (default `http://localhost:4000`). Set `APP_ENV=production` when serving through HTTPS to enable secure session cookies. Sessions are in memory and require login after a restart.

Run `go test ./...` for backend tests. From `frontend`, run `npm run test:integration` for browser checks against an isolated database.

From the repository root, `docker compose up --build -d` builds separate backend and frontend images. SQLite and uploads persist in the `social-data` volume. See the frontend README for usage.
