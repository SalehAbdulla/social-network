# Backend

Run `sh ./dev.sh` (Linux/macOS/WSL) or `.\dev.cmd` (Windows). Go and a C compiler are required for SQLite. The server listens on port 5174; `PORT` overrides it.

Register an account in the frontend, then sign in normally. Startup does not seed development users, and there is no development session endpoint or password-free account switching. The seed command is only used explicitly by isolated integration test fixtures.

`DATABASE_PATH` selects the SQLite database, `UPLOAD_DIR` selects file storage, and `FRONTEND_ORIGIN` selects the browser origin (default `http://localhost:4000`). Set `APP_ENV=production` when serving through HTTPS to enable secure session cookies. Sessions live in the `session` table and survive a restart: they expire after 14 days of inactivity or 30 days after login, and expired rows are cleaned up hourly.

Two rules worth knowing before touching the chat code. Private messages are only allowed when at least one of the two users follows the other, or the recipient's profile is public; the rule is enforced in `SocialService.CanMessage`, on the REST send/read endpoints, on the WebSocket `private_msg` frame, and in the inbox query. Threads that no longer satisfy it are hidden rather than deleted, so re-following restores them. Nothing is deleted, but the history is not readable while the rule is unmet.

Run `go test ./...` for backend tests. From `frontend`, run `npm run test:integration` for browser checks against an isolated database.

## Media pipeline

An upload is stored under a fresh UUID, typed from its bytes. If it is an image this toolchain can
decode, `pkg/media` also writes a 480 px `_thumb` and a 1600 px `_large` file beside it, in the same
request, and `GET /api/v1/media/{id}` serves whichever of the three `?size=` names — falling back to
the original when there is no such derivative, which is what lets the frontend put both candidates
in a `srcset` without knowing anything about the file. `pkg/media` holds the rules and their reasons:
no derivative of a video or of an animated GIF, never an upscale, JPEG for JPEG sources and PNG for
everything else so alpha survives. The collector takes the derivatives with the original, and the
stray sweep recognises a `_thumb`/`_large` name without ever touching a file whose base is not a
UUID.

`go test ./pkg/app/repositories/` also runs the query-plan check. It seeds a database, prints `EXPLAIN QUERY PLAN` for the read paths behind the feed, the comment list, the notifications list, the chat list, the follow-request list and one entity's score, asserts which index each one leans on, and — for the indexes `000013` creates — drops the index and measures the query again. That last part is why the numbers next to each index in the migration are reproducible rather than asserted: run the package and you get the before and after on your own machine. When you add a query that reads one of those tables, add a case there; a plan that scans says so by name before a user notices.

From the repository root, `docker compose up --build -d` builds separate backend and frontend images. SQLite and uploads persist in the `social-data` volume. See the frontend README for usage.

## Profiles

`GET /api/v1/users/{userId}` (and `/users/me`, and the mention route `GET /api/v1/handles/{nickname}`) answers with the member's profile, including a **viewer-relative** `postCount`. It is computed with the same `postVisibility` fragment the posts list uses, so the number on the header and the page under it cannot disagree, and a post the viewer may not read is not counted for them. A profile the viewer may not read masks the count along with the name, avatar and follower lists in `writeProfile` — it is zeroed there rather than left to the fragment, because a `selected` grant can keep a post readable to someone who may not read the profile at all, and a count that still moved would leak that the post exists. The count rides `post_userId_createdAt` (it is the posts list's own fragment over one author), which `query_plan_test.go` asserts as its own case.

## Bookmarks

`POST /api/v1/posts/{postId}/save` and `DELETE /api/v1/posts/{postId}/save` add and remove one post from the caller's private list, and `GET /api/v1/saved-posts` pages it. Both writes are idempotent — saving the same post twice, or un-saving one that was never saved, answers 200 with the resulting state rather than a conflict — and saving a post the caller cannot read is a 404, the same answer a read gives, so the endpoint cannot be used to probe for posts. The list runs the same visibility fragment as the feed (`PostRepository.postVisibility`), which is why a post that later becomes unreadable is absent from it rather than a back door to it, and a deleted post takes its row with it through `ON DELETE CASCADE`. Feed and single-post responses carry a viewer-relative `isSaved` for the control on the card.

## Search

`GET /api/v1/posts/search?q=&page=&size=` answers with the posts whose title or content contains the term, newest first, in the feed's response shape and behind the feed's own visibility fragment (`PostRepository.postVisibility`) — so a search is not a second way to read a post. The pattern is escaped by `likePattern`, so a `%` or `_` typed into the box is a character rather than a wildcard, and a blank query is a 400 rather than the `%%` that would match every post. No index can serve it, because the pattern starts with `%`; that is why the query-plan table lists this query with no index instead of claiming one. `GET /api/v1/users?q=` and `GET /api/v1/groups?q=` already answered the other two halves of the page, and `likePattern` is shared by all three now rather than written out in each.

## Hashtags and mentions

`GET /api/v1/hashtags/{tag}` is the page a `#tag` link opens: the posts whose title or body carries that tag, newest first, in the feed's shape and behind the same visibility fragment as the feed. Nothing is stored and there is no backfill to run — the tag is matched in the text with `GLOB` over a lowercased `' ' || title || ' ' || content || ' '`. `GLOB` is what makes the boundary rule expressible (`LIKE` has no character classes): the tag may not be glued to a word on either side, so `#travel` matches neither `#traveling` nor `abc#travel`, and the space padded onto each end is what lets a tag sit at the very start of a title. The handler restricts the tag to `[a-z0-9_]` before it reaches the pattern, which is also what keeps it out of `GLOB`'s own syntax. It scans, so it is listed in the query-plan table with no index, beside the text search and for the same reason.

`GET /api/v1/handles/{nickname}` is what a `@handle` link opens: it resolves a handle to the account it names, ignoring case on both sides, and answers with the same profile and the same masking as `/users/{userId}` — the masking is shared code rather than a second copy, so a private profile cannot be read through the handle route instead. It cannot live under `/users/`: a literal segment there sits at the same depth as `{userId}` in `/users/{userId}/media` and its siblings, and Go's mux refuses that pair at registration.

## Reactions

One table serves three kinds of row, because `reaction` is keyed by `(userId, entityType, entityId)` and `000013` indexes `(entityType, entityId)`: `post`, `comment` and — since this session — `message`. `POST /api/v1/reactions` is the only way in, and the permission is the entity's own read rule: a post must pass `CanViewPost`, a comment `CanViewComment`, and a message must name the caller as one of its two participants. A target the caller may not read answers **404** rather than 403, so the endpoint cannot be used to learn that a row exists. Sending `+1` twice removes the reaction — that is the toggle the buttons on a post and a chat message both rely on. `post` and `comment` keep a denormalised `score` column that this endpoint maintains; a message deliberately does not, and the chat list reads its total from the table through the index instead. `000015` adds the cleanup a message was missing: deleting it takes its reactions with it, the way deleting a comment already does — and it has to be a trigger, because `reaction.entityId` is shared by three kinds of row and so cannot be a foreign key.

## Chat media

`GET /api/v1/messages/media?partnerId=&offset=` is the media tab of a direct conversation: the same thread as `GET /api/v1/messages`, narrowed to the rows that carry an attachment, behind the same `CanMessage` rule and the same hidden-for-me rule — so the tab cannot show media from a thread the reader may not open, and cannot become a way around either. It answers with a small `ConversationMediaItem` (id, url, type, time) rather than a `MessageDTO`, because a tile needs nothing else; the profile media tab made the same choice with its own `MediaItem`. The frontend opens those attachments in the app's `Lightbox`, and so does a bubble's attachment and a group post's photo — the two `target="_blank"` sites the lightbox session left behind.

## Stories and the seen ring

`GET /api/v1/stories` lists the live stories newest first, each with a viewer-relative `viewed` boolean — the flag the frontend draws the ring around an author's avatar from. It is the same idea as a post's `isSaved`: the flag belongs to the account that asked, not to the story. It is folded in with a `LEFT JOIN` on `storyView` keyed on `(storyId, userId)`, which is that table's primary key, so the join is one lookup per story rather than a query per row.

`POST /api/v1/stories/{id}/view` records that the caller opened a story, and answers 200 whether or not it was a first view — the write is `ON CONFLICT DO NOTHING`, so a repeat is a state rather than a conflict, which is what lets the strip flip the ring optimistically and send the mark best-effort. A story that is unknown or expired answers **404**, the same answer a read gives, so the endpoint cannot be used to confirm that a dead story exists; the expiry is checked before the write for exactly that reason. `000016` adds the `storyView` table, keyed on the pair so a second view is one row, with `ON DELETE CASCADE` on both columns — deleting the story *or* the account takes its views with it, which is what the `storyView_userId` index is for, because the cascade deletes by `userId` alone and the primary key starts at `storyId`.

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

