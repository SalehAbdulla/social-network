# Backend development

Go and a C compiler on `PATH` are required because the SQLite driver uses CGO.
The commands below assume the `backend` directory. Starting with `go run .` from
`backend/cmd` also works: database, migration, and default upload paths are resolved
from the backend directory regardless of which subdirectory you start in.

## Connected frontend with demo users

On Windows, run `.\dev.cmd` from this directory. It seeds Dummy User and Alex Demo,
sets `DEV_DUMMY_USER=true`, and starts the backend on port 5174. Existing demo users
are preserved. The script also detects the local MinGW compiler and uses a build
cache under `tmp/go-build` unless `GOCACHE` is already configured.

On Ubuntu / WSL or macOS, run from `backend`:

```sh
sh ./dev.sh
```

If your terminal is already in `backend/cmd`, use `sh ../dev.sh` instead.
This script seeds both demo accounts, enables demo sessions, and starts the server.
To start manually from `backend/cmd`, run `go run ./seed -demo`, followed by
`DEV_DUMMY_USER=true go run .`.

Set `NEXT_PUBLIC_DEV_USER=true` and `BACKEND_URL=http://127.0.0.1:5174` in the
frontend environment, then run `npm run dev` from `frontend` and open
http://localhost:4000. The sidebar switches between `dummy@example.com` and
`alex@example.com`. See [frontend setup and checks](../frontend/README.md).

`POST /api/v1/dev/session` accepts either demo email and creates a normal backend
session cookie. It is disabled unless explicitly enabled and is always disabled
when `APP_ENV=production`. Other routes continue to require a valid session.

WebSocket connections accept `http://localhost:4000` by default. Set
`FRONTEND_ORIGIN` to the frontend's exact origin if you use another hostname or
port. Uploaded files are stored in `uploads` (`UPLOAD_DIR` overrides the directory).

Run `go test ./...` for backend tests. Run `npm run test:integration` from
`frontend` for the isolated browser integration check.

## Temporary dummy user

Create the user in `pkg/db/socialnetwork.db`:

```sh
go run ./cmd/seed
```

The command applies migrations and stores a bcrypt password hash. Running it
again keeps the existing user, ID, and password unchanged. It only runs when
explicitly invoked; ordinary backend startup does not create test accounts.
Use this account only in your local development database.

- Email: `dummy@example.com`
- Nickname: `dummyuser`
- Password: `DummyUser123!`
- Name: Dummy User

Start the backend:

```sh
go run ./cmd
```

The default address is `http://localhost:5174` (`PORT` overrides the port).

Log in with a URL-encoded form, using either the email or nickname as `identifier`:

```http
POST http://localhost:5174/api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

identifier=dummy%40example.com&password=DummyUser123%21
```

Login sets an HTTP-only `session_token` cookie. Send that cookie with subsequent
requests, including `GET /api/v1/auth/me` to retrieve the dummy user's profile
and `userId`. Sessions are held in memory, so log in again after restarting the
backend.

For frontend requests, use `credentials: 'include'` with fetch or
`withCredentials: true` with Axios. Route requests through a same-origin proxy,
or configure credentialed CORS on the backend when calling it directly from a
different origin.
