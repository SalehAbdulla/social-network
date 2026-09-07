# Backend development

Run commands from the `backend` directory. Go and a C compiler on `PATH` are
required because the SQLite driver uses CGO.

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
