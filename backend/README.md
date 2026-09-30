# Backend

Run `sh ./dev.sh` (Linux/macOS/WSL) or `.\dev.cmd` (Windows). Go and a C compiler are required for SQLite. The server listens on port 5174; `PORT` overrides it.

Register an account in the frontend, then sign in normally. Startup does not seed development users, and there is no development session endpoint or password-free account switching. The seed command is only used explicitly by isolated integration test fixtures.

`DATABASE_PATH` selects the SQLite database, `UPLOAD_DIR` selects file storage, and `FRONTEND_ORIGIN` selects the browser origin (default `http://localhost:4000`). Set `APP_ENV=production` when serving through HTTPS to enable secure session cookies. Sessions live in the `session` table and survive a restart: they expire after 14 days of inactivity or 30 days after login, and expired rows are cleaned up hourly.

Two rules worth knowing before touching the chat code. Private messages are only allowed when at least one of the two users follows the other, or the recipient's profile is public; the rule is enforced in `SocialService.CanMessage`, on the REST send/read endpoints, on the WebSocket `private_msg` frame, and in the inbox query. Threads that no longer satisfy it are hidden rather than deleted, so re-following restores them. Nothing is deleted, but the history is not readable while the rule is unmet.

Run `go test ./...` for backend tests. From `frontend`, run `npm run test:integration` for browser checks against an isolated database.

`go test ./pkg/app/repositories/` also runs the query-plan check. It seeds a database, prints `EXPLAIN QUERY PLAN` for the read paths behind the feed, the comment list, the notifications list, the chat list, the follow-request list and one entity's score, asserts which index each one leans on, and — for the indexes `000013` creates — drops the index and measures the query again. That last part is why the numbers next to each index in the migration are reproducible rather than asserted: run the package and you get the before and after on your own machine. When you add a query that reads one of those tables, add a case there; a plan that scans says so by name before a user notices.

From the repository root, `docker compose up --build -d` builds separate backend and frontend images. SQLite and uploads persist in the `social-data` volume. See the frontend README for usage.

## WebSocket protocol

The hub is `pkg/websocket` and `pkg/app/handlers/WebSocketHandler.go` is the only reader of a
socket; the events below are its whole vocabulary. Every wire name is a constant in
`pkg/websocket/types.go`, and `pkg/websocket/protocol_doc_test.go` fails if a constant or an
exported payload struct there is missing from this section, so this page and the code cannot
drift apart.

**Connecting.** `GET /ws` upgrades when the request carries the `session_token` cookie and its
`Origin` is the configured frontend origin. The token is deliberately not accepted in the query
string, because a URL ends up in proxy logs and browser history. Each tab is its own client, so
an account with three tabs has three sockets and every event for that account is delivered to
all of them.

**Envelope.** One JSON object per event, in both directions:

```json
{"type": "typing", "payload": {"senderId": "...", "recipientId": "...", "senderNickname": "..."}}
```

The server may put several of those in one WebSocket message, separated by newlines: its write
pump batches whatever is queued. A client has to split on `\n` before parsing, which is what
`frontend/src/app/components/BackendProvider.tsx` does. An unknown client `type` is logged and
dropped. The browser re-dispatches every frame as a `social:socket` DOM event, which is where
the frontend's components listen, so an event can be added here and consumed there without
either side knowing about the socket.

### Client to server

| `type` | payload | what the server does |
| --- | --- | --- |
| `private_msg` | `PrivateMsgPayload`: `recipientId`, `text` | Stores the message and answers with `incoming_msg` to both ends. The chat rule is the one the REST endpoint enforces (`CanMessage`, see above); a refused message is logged and dropped — and, because nothing sends `send_error`, the sender is told nothing. |
| `typing` | `TypingPayload`: `senderId`, `recipientId` | Forwards `typing` to the recipient with `senderNickname` filled in. Ignored unless `senderId` is the socket's own user. |
| `typing_stopped` | `TypingPayload`: `senderId`, `recipientId` | The same, as `typing_stopped`. |
| `open_chat` | `OpenChatPayload`: `partnerId` | Marks this socket as viewing that conversation: a message from that partner then raises no notification, and their messages to this account are marked read. |
| `close_chat` | none | Clears it. |
| `user_offline` | none | Unregisters this socket, as closing the tab would. |

### Server to client

| `type` | payload | sent when, and to whom |
| --- | --- | --- |
| `incoming_msg` | `IncomingMsgPayload`: `messageId`, `senderId`, `senderNickname`, `text`, `timeStamp` | A private message was stored: to the recipient, and to the sender as an echo of what was saved. |
| `message_changed` | `messageId`, with `senderId` and `recipientId` on an edit | A message was edited or deleted: to both participants. |
| `read_receipt` | `readerId`, `partnerId` | `POST /api/v1/messages/read`: to the partner. |
| `notification` | `NotificationPayload`: `notificationId`, `actorId`, `actorNickname`, `entityType`, `entityId`, `createdAt` — or `notification.NotificationDTO`, which adds `postId` and `isRead` | A notification was created: to the account it belongs to. The socket path (a new private message) builds the narrower payload; the REST paths (a comment, `POST /api/v1/messages`) send the DTO. The shared fields are the ones a client should read; the frontend reloads its list rather than parsing either, which is why the difference went unnoticed. |
| `notification_changed` | `{}` | A notification was read, or all of them were: to that account, so its badge can settle without a poll. |
| `social_changed` | `actorId`, `targetId` | A follow, an unfollow or a follow-request decision: to both accounts. |
| `group_changed` | `groupId`, `kind` | Group content changed: to every member. `kind` is the tab that changed (`posts`, `comments`, `events`, `messages`, `media`, `timeline`) or what happened to the group itself (`created`, `request`, `membership`, `details`, `members`, `deleted`). |
| `typing`, `typing_stopped` | `senderId`, `recipientId`, `senderNickname` | The echo of the two client events above: to the recipient. |
| `user_status` | `UserStatusPayload`: `userId`, `isOnline` (`1` or `0`) | An account's first socket opened or last one closed: to every other connected account. |
| `send_error` | `SendErrorPayload`: `recipientId`, `message` | **Never sent.** The constant and its payload type exist in `types.go` and no code path produces them, which is why a refused `private_msg` is silent to its sender. Documented rather than deleted, because removing a name from the protocol is its owner's decision and not a side effect of writing this page. |
| `connected` | `{}` | **Client-side only**: synthesised by `BackendProvider` when the socket opens. It never crosses the wire, and it is the one name here that is not a `types.go` constant. |

