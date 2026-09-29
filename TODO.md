# Social Network Project TODO

Legend: `[x]` verified working on `main` @ `cb91348` unless an item notes local verification · `[ ]` open · **P0** blocks a mandatory
spec line · **P1** required before release · **P2** polish · **P3** nice to have.

Items closed on 2026-09-28 after that revision carry their own evidence line. The backend ones
are locally verified with `go build ./...`, `go vet ./...` and `go test ./...`; the frontend
ones with `npm run lint` (0 errors), `npx tsc --noEmit` and `npm run build`. They are
uncommitted until reviewed, and the browser smoke suite was not run — see the session note at
the end of this file.

Baseline checks: `go test ./...` passes, `go vet ./...` is clean, both Docker images build
through `compose.yaml`, and migrations `000001`–`000010` are applied at boot by
`backend/pkg/db/sqlite/sqlite.go`.

Working today: auth (register with an optional avatar, About Me and visibility choice,
login/logout, bcrypt, cookie sessions), public/private
profiles, followers/following lists, posts with three privacy levels, reactions, comments
with images, groups (create/browse/invite/request/accept/post/comment/event+RSVP/chat/
transfer/leave), notifications with WebSocket push and separate notification and message
badges, media uploads
(JPEG/PNG/GIF/WebP/MP4/WebM), stories, and realtime chat with typing, read receipts and
presence.

Spec-critical gaps: none open. Closed on 2026-09-28: comment media (P0-2), the chat permission
rules (P0-3), the notification/message split (P0-4), register field parity (P0-5) and durable
sessions (P0-6); see "Work in flight and handoff" at the end of this file for what is still in
someone else's hands.

## Working prompt

Paste this into a fresh session before starting any item below. The point is a solid plan
first, implementation second.

> Read the repository before writing anything: `README.md`, `DEPLOYMENT.md`, this `TODO.md`,
> then every file named in the task. Do not guess at behaviour — open the code and quote the
> lines you are relying on.
>
> Then write a solid plan and show it to me:
>
> 1. Restate the task and its acceptance criteria in your own words.
> 2. List every file you will change or add, and why.
> 3. Give the exact API contract: route, method, request and response JSON, status codes.
>    For any schema change, give the migration including its `down`.
> 4. Name the existing conventions you will follow: the handler → service → repository
>    layering, `respond` / `HandleError`, `react-hot-toast` for user-facing errors,
>    `MediaHandler`-style input validation, and the Tailwind design tokens in
>    `frontend/src/app/globals.css`.
> 5. Call out what you are unsure about, the alternatives you rejected, and anything that
>    could break existing data or the privacy rules.
> 6. Give the test plan: the Go tests, the browser smoke steps in
>    `frontend/scripts/integration-smoke.mjs`, and the exact commands you will run
>    (`go build ./...`, `go vet ./...`, `go test ./...`, `npm run lint`, `npm run build`).
>
> Stop there and wait for my approval.
>
> Once approved, implement it in small steps and run the relevant check after each step
> rather than only at the end. If the plan turns out to be wrong mid-implementation, stop
> and tell me instead of improvising. Never weaken a privacy rule or delete a test to make
> something pass.
>
> When finished: run the checks, show me the output, and update this file — tick the items
> and add a one-line note about what changed.

## P0 — Spec-critical gaps

### P0-1 · Follow-request workflow (implemented; verified locally)

Spec: following is a request the recipient accepts or declines, and a public profile
bypasses that. Implemented 2026-09-27: private requests use the existing `connection`
table; public profiles are followed immediately. No migration or existing-follower changes.

Policy: duplicate follows, duplicate pending requests and reverse pending requests return
409. Reverse requests require explicit acceptance or decline in Notifications. Acceptance
atomically removes the request and inserts the directional follow; decline/cancel removes
the request without granting access. Resolved request notifications are removed. Changing
a profile to public does not auto-accept pending requests. Pending flags are viewer-relative.

Verified: `go build ./...`, `go vet ./...`, `go test ./...` in WSL; `npm run build`;
`npm run lint` (0 errors, 27 existing warnings); full browser smoke suite, including
request/decline/cancel/accept and follower-only media access. Windows Application Control
blocks the installed GCC linker, so browser validation used a temporary WSL-backend adapter
with Windows Next.js/Chrome. Artifacts: `backend/tmp/integration-1790521877966`.

- [x] **P0** Rework `FollowUser`: target `isPublic = 1` → insert into `follow`; private
  target → insert `connection(requesterId, recipientId, 'pending')`.
- [x] **P0** Add pending-in/pending-out flags to `models.SocialUser` and populate them in
  `SocialRepository.SocialProfile` so the UI can render Follow / Requested / Following.
- [x] **P0** New routes in `backend/cmd/router.go`: `GET /api/v1/follow-requests`
  (incoming pending), `PUT /api/v1/follow-requests/{userId}` (accept → promote to
  `follow`), `DELETE /api/v1/follow-requests/{userId}` (decline → drop the row).
- [x] **P0** Repository methods plus `SocialService` validation: no self-requests, reject
  when already following, already pending, or a reverse request exists (auto-accept that
  case or require an explicit decision — document the choice).
- [x] **P0** Add `follow_request` to the `entityType IN (...)` allow-lists in
  `backend/pkg/app/repositories/NotificationRepository.go` (count, unread count, list) and
  raise the notification when a request is sent.
- [x] **P0** Push it over the hub via `re.socialNotification`,
  which already handles the `follow` type.
- [x] **P0** Frontend: pending-request surface (a section in
  `frontend/src/app/notifications/page.tsx`) with accept/decline actions.
- [x] **P0** Frontend: Follow / Requested / Unfollow in `frontend/src/app/profile/page.tsx`,
  `frontend/src/app/discover/page.tsx` and `FollowListModal.tsx`; click Requested to cancel.
- [x] **P1** Keep `DELETE /users/{userId}/follow` working for unfollow, and make it cancel
  an outstanding request instead of erroring.
- [x] **P1** Test `backend/cmd/follow_request_test.go`: public auto-follow, private pending,
  accept, decline, cancel, duplicates, self/reverse requests, authorization, viewer flags,
  notification rows/counts/WS push, concurrent requests and acceptance rollback.

Acceptance: following a private profile produces a notification, the requester sees
"Requested" instead of a follower, the follower list only changes after acceptance, and a
public profile is still followed instantly.

### P0-2 · Comments cannot carry an image or GIF (implemented 2026-09-28; verified locally)

Spec: "While creating a post or a comment, the user can include an image or GIF." The
`comment` table had no media column, `CommentRepository.CreateComment` took only text, and
the composer in `frontend/src/app/components/PostCard.tsx` posted `URLSearchParams`. The
ASCII-only gate in `CommentHandler.go` also rejected any emoji comment.

Policy: a comment carries up to four of the commenter's own uploads in a JSON array in
`comment.imageUrls`, mirroring `post.imageUrls`. Every URL is checked with
`SocialService.ValidateMedia(userID, url, "image")`, so another member's upload is a 403 and
a foreign URL is a 400. The endpoint reads a JSON body and still accepts the legacy form
encoding, so older clients and the existing tests keep working. Text length is counted in
runes, which is what makes an emoji comment legal; the ASCII gate stays for post titles and
content. Comment photos are readable by exactly the audience that can read their post:
`CanViewMedia` gained a comment branch, so deleting a comment revokes the photo for everyone
except its uploader (rows and files are deliberately left alone — see the orphaned-media
item under Reliability).

Verified: `go build ./...`, `go vet ./...`, `go test ./...`; `npm run lint` (0 errors);
`npm run build`; the full browser smoke suite. New coverage:
`backend/cmd/comment_media_test.go` (own-photo accepted, foreign photo 403, non-media URL
400, five photos 400, emoji stored and preserved through an edit, follower reads the photo,
stranger 403, photo hidden after the comment is deleted, merged profile media list, private
profile hides the tab, legacy form comment still 201) and two new browser steps in
`frontend/scripts/integration-smoke.mjs` (comment photo renders and is served; the profile
media tab lists it). Artifacts: `backend/tmp/integration-1790600922303`.

- [x] **P0** Migration `000010_comment_media.up.sql` / `.down.sql`:
  `ALTER TABLE comment ADD COLUMN imageUrls TEXT NOT NULL DEFAULT '[]'`, mirroring
  `post.imageUrls` from `000002_social_features.up.sql`, plus a `comment_userId` index for
  the profile media query. _The task text said `000009`; that number is taken by
  `000009_session_lifecycle` from P0-6, so the new migration is `000010`._
- [x] **P0** Threaded media through `CommentRepository.CreateComment`/`GetComments`, the
  `comment` domain model, and the `comment.CommentDTO` payload.
- [x] **P0** `CreateComments` (`backend/pkg/app/handlers/CommentHandler.go`): accepts
  `imageUrls` in a JSON body (form encoding still works), validates each with
  `SocialService.ValidateMedia(userID, url, "image")`, caps the count at four, and counts
  runes so emoji are allowed.
- [x] **P0** Frontend: `ImagePicker` in the comment composer, JSON post body, rendered the
  images in the comment list, and the profile media grid now reads
  `GET /api/v1/users/{userId}/media`, which merges post and comment photos.
- [x] **P1** Media access follows the comment: `CanViewMedia` resolves comment photos
  through `postVisibility` and `CommentService.DeleteComment` therefore revokes them. The
  `media` rows and files are intentionally left in place — the same upload can be referenced
  by another row, and file removal is part of the orphaned-media item under Reliability.
- [x] **P1** Tests: comment with an image, invalid media URL rejected, foreign media URL
  rejected, comment media removed with the comment, plus the browser journey.

### P0-3 · Private chat ignored the follow rule (implemented 2026-09-28; verified locally)

Spec: messages are only possible between users where at least one follows the other, and a
message is delivered instantly when the recipient follows the sender or has a public
profile. `SocialService.ValidateTarget` used to only check that the target exists and is not
the sender, so anyone could DM anyone.

Policy: `CanMessage` allows the pair when the recipient `isPublic = 1` or a `follow` row
exists in either direction. It is enforced on send (`POST /api/v1/messages`), on read
(`GET /api/v1/messages?partnerId=`, `POST /api/v1/messages/read`), on the WebSocket
`private_msg` frame (`WebSocketHandler.handlePrivateMessage`), in `MessageService.SendMessage`
and in `MessageRepository.GetChatUsers`, so the inbox and direct URLs agree with the send
rule. A blocked pair answers 403; a missing target stays 404 and self stays 400.

Migration story for rows that predate the rule: nothing is deleted. Non-permitted threads are
hidden from the inbox and from direct reads, and reappear as soon as either user follows the
other again. The rejected alternative was to keep grandfathered history readable; that would
contradict the inbox filter, since the conversation list is the only way to open a thread.

Verified: `go build ./...`, `go vet ./...`, `go test ./...` (new
`backend/cmd/chat_permission_test.go`: both follow directions, stranger → public allowed,
stranger → private rejected on REST and on the socket, inbox hiding, message rows surviving
the hiding), and a browser-smoke addition asserting 403 + a clean inbox.

- [x] **P0** Add `SocialService.CanMessage(actor, target)`: allowed when a `follow` row
  exists in either direction, or when the target is `isPublic = 1`.
- [x] **P0** Enforce it in `ChatMutationHandler.SendChatMessage` (line 38), `ReadChat`
  (line 132), `MessageService.SendMessage`, and `MessageRepository.GetChatUsers` so
  non-permitted threads never appear in the inbox.
- [x] **P0** Enforce the same rule for WebSocket delivery in
  `WebSocketHandler.handlePrivateMessage` (`backend/pkg/app/handlers/WebSocketHandler.go:94`).
- [x] **P0** Decide the migration story for existing `message` rows that predate the rule
  (keep them readable, or hide the threads) and document it.
- [x] **P1** Frontend: disable the "Message" action with an explanation when messaging is
  not allowed — `frontend/src/app/profile/page.tsx` and `frontend/src/app/discover/page.tsx`.
  The blocker is gone (the pagination rework that owned both files is committed), so this is
  two conditions on the existing `Message` links plus the viewer-relative `canMessage` flag
  that `GET /api/v1/users/{userId}` returns (typed as an optional `canMessage` in
  `frontend/src/app/api/social.ts`). Until then a blocked attempt fails with the backend's 403
  toast, which is correct but less friendly.
  Closed 2026-09-28: one component, `frontend/src/app/components/MessageAction.tsx`, now owns
  the rule in the UI — it renders the link when the flag is true and a non-interactive,
  `aria-disabled` action carrying an accessible explanation otherwise, so both pages say why
  rather than handing back a 403. It is used by the profile header (which passes
  `profile.canMessage === true` into `ProfileActions`) and by every discover card, and it fails
  closed so a missing flag cannot offer a chat the API would refuse. Evidence: the browser
  suite now asserts the three states it matters for — a private profile and the discover list
  hide the link while showing the reason, and accepting the follow brings the link back — and
  `cmd/chat_permission_test.go` gained the two assertions the UI depends on, that the discover
  list carries the viewer-relative flag in both the blocked and the unlocked case (the single
  profile endpoint was already covered).
- [x] **P1** Tests: mutual follow allowed, one-way follow allowed, stranger → public profile
  allowed, stranger → private profile rejected, WS push rejected for the same case.

### P0-4 · Notifications are not visually distinct from messages (implemented 2026-09-28; verified locally)

Spec: "New notifications are different from new private messages and should be displayed in
a different way!" One red badge used to count both (`SideBar.tsx` over an `entityType IN (...)`
list that included `message`), the Messages entry had no indicator at all, and the
notifications page rendered message rows with markup identical to follow/group rows.

Policy: the two counts are disjoint and the API keeps them apart. `GET
/api/v1/notifications` and `GET /api/v1/notifications/unread-count` accept `?types=` and
`?exclude=` taking **entity type names** (`comment`, `message`, `follow`, `follow_request`,
`group_invitation`, `group_request`, `group_event`): the bell badge asks for
`?exclude=message`, the Messages badge for `?types=message`. An unknown name is a 400 rather
than a silently ignored filter, `exclude` wins over `types`, both parameters are optional
(no parameters keeps the old behaviour of every type), and an empty result set is expressed
as a false SQL predicate because `IN ()` is invalid. The allow-list lives once in
`models.NotificationEntityTypes`, and the SQL builds its `IN (?,…)` from that list instead of
repeating a literal. On the frontend the bell keeps its red pill, the Messages entry gains a
teal pill carrying a `MessageSquare` glyph, and message rows become their own card with a
"Private message" caption and an "Open chat" call to action. "Mark all as read" still clears
message rows too, because the page lists them.

Verified: `go build ./...`, `go vet ./...`, `go test ./...`; `npm run lint` (0 errors);
`npm run build`; the full browser smoke suite. New coverage:
`backend/cmd/notification_types_test.go` (unfiltered count of both kinds, exclusion, single
and multiple types, `exclude` beating `types`, an emptied set, unknown and plural names
rejected on both endpoints, filtered lists with matching `totalElements`, reading the chat
zeroing only the message count) and two browser steps in
`frontend/scripts/integration-smoke.mjs` (an unread chat moves the Messages badge while the
bell badge stays put; the notifications page shows the "Open chat" card and opening the chat
clears the badge). Artifacts: `backend/tmp/integration-1790613918588`.

- [x] **P0** Split the indicators: bell badge for social/group notifications, a separate
  message indicator on the Messages entry, with different colours and icons.
- [x] **P0** Restyle `entityType === 'message'` rows on the notifications page as a
  distinct card (different accent, "Open chat" call to action).
- [x] **P1** Add a `?types=` / `exclude=messages` filter to `GET /api/v1/notifications` and
  to `NotificationRepository.GetUnreadCount` so the bell badge can exclude messages. The
  parameter values are the entity type names, so the exclusion is spelled `exclude=message`.
- [x] **P1** Test asserting the bell count excludes `message` rows and the message count
  excludes everything else.

### P0-5 · Register form does not match the required field list (implemented 2026-09-28; verified locally)

Spec requires Email, Password, First Name, Last Name and Date of Birth, and requires
Avatar/Image, Nickname and About Me to be *present in the form but skippable*. The register
branch of `frontend/src/app/login/page.tsx` had no Avatar or About Me input, Nickname was
mandatory, and the profile silently defaulted to public.

Policy: the form now carries all eight fields and only the five mandatory ones are required.
The nickname is genuinely optional — `user.nickName` is `NOT NULL UNIQUE` and every
`/profile/{id}` link assumes a handle, so a blank nickname is *generated* rather than
rejected: `AuthService.availableNickname` builds a handle from first+last name (falling back
to the email local part, then `user`), keeps only `[a-z0-9_]`, and appends a counter until
`NicknameAvailable` is true. About Me (≤1000 runes) and the public/private choice travel in
the register request and are written by the same `INSERT`, so there is no window where the
account exists with a default profile; `isPublic` is only treated as private when the form
sends `false`/`off`, which keeps the old public default for clients that omit it. No
migration was needed: `aboutMe`, `avatar` and `isPublic` already exist in `000001`.

Deviation from the sketch above, and why: **the avatar cannot ride in the register request.**
`POST /api/v1/media` sits behind `AuthMiddleware`, so an anonymous visitor cannot upload, and
`cmd/security.go` caps non-media bodies at 1 MiB so the file cannot be attached to the
register call either. Rejected options were an unauthenticated upload endpoint (anonymous
disk-fill vector) and multipart registration (duplicates the media pipeline inside the auth
handler and needs that cap raised for an anonymous endpoint). The form therefore previews the
picked file locally, and once `POST /auth/register` has set the session cookie the client
uploads it and attaches it with one `PUT /users/me`; a failure there warns instead of losing
the new account. `Avatar` is consequently not a `RegisterRequestDTO` field — About Me and the
visibility choice are, and the handle is returned by the register response so the client
never has to guess it.

`AuthRepository.InsertUser` now takes a `models.Registration` struct instead of nine
positional arguments, because adding `bio` and `isPublic` to a list that already held five
adjacent strings invited a silent swap.

Verified: `go build ./...`, `go vet ./...`, `go test ./...`; `npm run lint` (0 errors);
`npm run build`; the full browser smoke suite. New coverage:
`backend/cmd/register_fields_test.go` (mandatory-only signup plus a generated handle,
colliding names getting different handles, a typed handle surviving and a duplicate being
rejected, About Me and `isPublic=false` landing on the profile while a stranger gets the
stripped view, the `on`/`off` spellings, an over-long About Me rejected, and the documented
avatar path — upload, `PUT /users/me`, served to the owner and on the shared profile) and two
browser steps in `frontend/scripts/integration-smoke.mjs` (mandatory-only signup generating a
handle; the fully filled form keeping its handle and About Me, staying private, and saving the
uploaded photo). Artifacts: `backend/tmp/integration-1790615446452`.

- [x] **P0** Optional Avatar and About Me inputs with an upload preview. The preview is local
  to the form; the URL from `POST /api/v1/media` is attached straight after signup, for the
  reason above.
- [x] **P0** Persisted: `user.RegisterRequestDTO`, `AuthService.Register` and the
  `InsertUser` insert all carry About Me and the visibility choice; the avatar arrives with
  the follow-up profile update.
- [x] **P0** Nickname is optional and auto-generated, as described above.
- [x] **P1** Public/private choice at signup instead of defaulting `isPublic = 1`.
- [x] **P1** Test: registering with only the mandatory fields succeeds and generates a handle,
  and a supplied avatar/bio shows up on the profile.

### P0-6 · Sessions were in-memory; the `session` table was dead code (implemented 2026-09-28; verified locally)

`backend/pkg/app/service/SessionManager.go` used to keep tokens in Go maps while
`000001_create_users_table.up.sql` created a `session` table that nothing read or wrote, so
a backend restart signed everyone out (`DEPLOYMENT.md:20`) and the app could not scale past
one instance.

Policy: the maps are now a cache in front of the table. A lookup checks the cache, then falls
back to `SELECT ... FROM session`, so a cold process resolves a token written by a previous
one. A database failure degrades to cache-only instead of failing the request. `CreateSession`
revokes the user's other rows in the same transaction, which keeps the "logging in revokes the
previous token" rule across restarts. Lifetime is the earlier of 14 days idle and a 30-day
absolute cap; the activity write is throttled to once a minute, and `main.go` prunes expired
rows at startup and then hourly. Presence stays deliberately separate: it is a process-local
60 s window that is never consulted for authentication, the chat online dot comes from
`Hub.IsUserOnline`, and revoking a session clears presence because logout means offline.

Verified: `go build ./...`, `go vet ./...`, `go test ./...`. New tests:
`backend/cmd/session_test.go` (a login survives a simulated restart with a cold cache, an
expired row is rejected and deleted, logout removes the row, the second login revokes the
first row, cleanup spares a live row), `pkg/app/service/SessionManager_test.go` (sliding-expiry
math) and `pkg/db/sqlite/migrations_test.go` (up → down → up over every migration — nine when
this landed, ten now that 000010 exists — plus a check that 000009 carries existing tokens
over).

- [x] **P0** Persist sessions in the `session` table (token, `userId`, `expiresAt`, plus
  `createdAt`/`lastSeenAt` if sliding expiry is wanted).
- [x] **P0** Point `CreateSession` / `GetUserIdByToken` / `DeleteSession` at the database,
  keeping the in-memory map as a cache, and preserve the "logging in revokes the previous
  token" behaviour (`SessionManager.go:32`).
- [x] **P0** Add periodic cleanup of expired rows.
- [x] **P0** Separate presence (`Presence` / `IsUserOnline`, 60 s window) from session
  lifetime so the chat "online" dot cannot be confused with auth state.
- [x] **P1** Add sliding expiry (refresh on activity, absolute cap at 30 days) and an idle
  timeout.
- [x] **P1** Tests: session survives a simulated restart, an expired token is rejected,
  logout deletes the row.
- [x] **P1** Update `DEPLOYMENT.md` and `backend/README.md`, which currently document the
  in-memory limitation as accepted.

## Groups

Reference: `GroupHandler.go`, `GroupManagementHandler.go`, `GroupContentHandler.go`,
`GroupService.go`, `frontend/src/app/components/GroupConversation.tsx`.

- [x] Create a group with title, description and image; browse all groups
  (`/api/v1/groups?scope=all`) and search by name.
- [x] Invitations: owner or member can invite (`GroupService.Invite`); invitee accepts or
  declines (`GroupInvitations.tsx`).
- [x] Join requests: user requests to join; only the owner accepts or refuses
  (`GroupHandler.DecideGroupRequest`).
- [x] Group posts, comments, and a group chat room (`groupContent.kind = 'messages'`).
- [x] Events with `startsAt` plus Going / Not going RSVP (`groupRSVP`, `GroupRSVP`).
- [x] Members list, remove member, leave group, delete group, transfer ownership
  (`ManageGroupMember`, "Make group owner").
- [x] **P1** Route `group_request`, `group_invitation` and `group_event` notifications
  through `NotificationService.CreateNotification` instead of raw SQL inserts, so they push
  over the hub at creation time instead of relying on a refetch. The three inline inserts are
  gone; the handlers create the rows after the group action commits and push each one through
  `notifyUser`, the same helper the comment, message and follow paths use. The service
  whitelist now reads `models.IsNotificationEntityType`, and the repos report whether a
  request or invitation actually landed so a repeat while one is pending cannot duplicate the
  notification. Wire change: these flows used to send `notification_changed` (a refetch cue)
  and now send the created row as `notification`; `TestLiveConnectionUpdates` was updated to
  assert the payload rather than just the type.
- [x] **P1** Make group notifications deep-link to the view that needs attention rather than
  the group's chat tab: a join request opens `?tab=info` (where it is accepted or declined),
  an event opens `?tab=events`, which `GroupConversation` now reads as its entry tab. The row
  still points at the group, so this also fixes notifications created before the change. It
  lands on the events list rather than highlighting the exact event, because the row does not
  carry the event id; storing one would need a migration for a marginal gain.
- [x] **P2** Paginate the members and requests lists (currently fetch-all). Closed 2026-09-28:
  both lists use the paging the rest of the app already speaks — `?offset=` with a `LIMIT 31`
  query (30 rows plus one sentinel row that tells the client there is more) and a bare slice, which
  `usePagedList` + `LoadMore` consume without a new envelope. `GroupConversation.tsx` now pages
  them, keeps the live refresh on `refresh` (which folds page 1 in without dropping pages already
  opened) and re-reads from page 1 after a mutation, since the list itself changed. The
  notification fan-out keeps an unbounded `AllGroupMembers`: paging *that* would have quietly
  stopped telling everyone past the thirtieth member about an event or an announcement, which is
  why the two queries share one constant instead of the paged one replacing the other.
  Two things worth recording. The `ORDER BY` gained a final tiebreaker (`gm.userId`,
  `r.requestId`) because paging a sort that ties is exactly how `LIMIT`/`OFFSET` starts repeating
  and skipping rows — and the test seeds every row with the same timestamp to keep that honest.
  And the browser suite caught a real wiring bug in the first attempt: the page query was
  `&offset=`, which is right for keys that already carry a `?` but produced `/groups/1/members&offset=0`
  for these two, so every group step 404'd until it was `?offset=`. Verified: `cmd/group_pagination_test.go`
  drives 41 members and 41 requests over two pages and asserts the sentinel row is the only repeat,
  the union is complete, the owner leads the member list, and both endpoints still answer 403 to a
  non-member and a non-owner on *page 2*; `go build`/`vet`/`test ./...` pass; `npm run lint` (0 errors)
  and `npx tsc --noEmit` are clean; the browser suite passes 27 steps with two new assertions on the
  group info tab — a short list renders every member and offers no second page. **Not browser-tested:
  the >30-row path**, only Go-tested: seeding 31 accounts into the browser fixtures would disturb what
  the existing steps assert about the seeded data, and the honest place to get that coverage is the
  demo seed (see the P3 item about extending it).
- [x] **P2** Split upcoming and past events, and add an event reminder. Closed 2026-09-28.
  **The split** is a query decision rather than a UI one: `ListGroupContent` orders the events tab by
  when things happen — upcoming soonest first, then past most recent first — and hands each event an
  `upcoming` flag computed from the same expression, so the two sections the tab renders cannot
  disagree with the order they are in. Three details make that honest. Every comparison goes through
  SQLite's `datetime()`, because `startsAt` is stored as RFC3339 and comparing
  `2026-09-29T18:00:00Z` against `datetime('now')` as a plain string misjudges any event later the
  same day (`'T'` sorts after `' '`) — the test creates exactly that event to keep it pinned. The
  ordering ends on `id`, so paging a tab whose timestamps tie still has a total order. And the flag is
  what keeps the render pure: the first attempt computed `Date.now()` during render and the lint
  config rightly rejected it, so the client no longer owns a clock and the sections are a function of
  what the server sent.
  **The reminder** is a new periodic job (`handlers/GroupEventReminders.go`), shaped like the media
  collector and started from `main.go` every five minutes with a one-hour lead. It finds events
  starting inside the window that are unstamped, notifies every member who answered *going* through
  the existing `group_event` path — never the author, never a decliner, pointing at the group so it
  deep-links to the events tab — and stamps the row. Migration `000011_event_reminder` adds
  `reminderSentAt`, and `MarkEventReminded` only stamps an unstamped row, so a repeat sweep or a
  second instance finds nothing instead of reminding twice; the deliberate trade is that a crash
  between the stamp and the last notification loses one reminder rather than duplicating it.
  Verified: `cmd/group_events_test.go` creates events through the API (so they carry the real RFC3339
  form) plus two past ones written straight to the table, and asserts the order, the `upcoming` flag
  agreeing with that order, that one sweep reports exactly one event and one member told, that the
  author and the decliner get nothing, that a second sweep is a no-op, and that the out-of-window and
  past events stay unstamped; `migrations_test.go` runs eleven migrations up→down→up, checks the
  column survives, and its version expectation moved to 11; `go build`/`vet`/`test ./...` pass, and
  the browser suite passes with an assertion that the event sits under the Upcoming heading.
- [x] **P2** Tests for leave / remove / transfer / delete authorization edges (owner cannot
  be removed, non-owner cannot remove others). Closed 2026-09-28:
  `cmd/group_authorization_test.go` registers a third and a fourth account through the real signup
  endpoint and pins the refusals — a plain member cannot remove the owner or another member, only
  the owner transfers and only to the literal role `owner`, a transfer to a non-member is a 404,
  the owner can neither be removed nor leave (400, so a group is never left ownerless), the former
  owner loses delete and removal rights but may still leave, leaving closes the member-only doors,
  a stranger can do nothing in the group, an invitation is answerable only by its invitee, and only
  the owner may read or decide join requests while the owner's acceptance still adds the applicant.
  The membership count is read back from the database after leaving and after deletion, so a
  cascade that failed to run would fail the test.

## Authentication and Security

- [x] bcrypt hashing, HttpOnly cookie sessions, `Secure` in production, `SameSite=Lax`,
  `rememberMe` max-age, and token revocation on re-login.
- [x] Per-peer rate limits (20/min login+register, 1200/min general), 1 MiB JSON body cap,
  51 MiB upload cap, `Content-Type` detection on uploads.
- [x] No Clerk code remains in `frontend/src` (grep returns zero hits).
- [x] **P0** Remove the query-string token fallback in `WebSocketHandler.ServeWs`
  (`backend/pkg/app/handlers/WebSocketHandler.go:30`) — the cookie is already forwarded by
  the Next.js rewrites and query tokens leak into logs and history.
- [x] **P0** Tighten `allowedOrigin` (`backend/pkg/app/handlers/SocialHandler.go:40`): it
  returns `true` when the `Origin` header is absent, so non-browser clients can open a
  socket. Require the header for upgrades.
- [x] **P1** Clear the stale auth documentation: `frontend/.env.example` ("Keep your
  existing Clerk keys"), the same line in `frontend/README.md`, and the Clerk entries that
  used to be in this file.
- [x] **P1** Drop `NEXT_PUBLIC_DEV_USER` from `frontend/.env.local` and the matching warning
  in `DEPLOYMENT.md:20` — no code reads it any more.
- [x] **P1** Document and test the security headers by asserting them on an API response.
  `backend/cmd/security_test.go` pins `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Content-Security-Policy` and `Cache-Control` on an `/api/` response, and
  `DEPLOYMENT.md` records which layer owns what. Two of the three headers named in the task did
  not exist: the middleware set `nosniff` and `Referrer-Policy` only, so `X-Frame-Options: DENY`
  and a `default-src 'none'; frame-ancestors 'none'` CSP were added for API responses. HSTS and
  a document CSP are deliberately left to the layer that serves HTML (the reverse proxy or the
  frontend) rather than claimed here, because an API response is never a document.
- [x] **P1** Add per-account login throttling on top of the per-peer limit, because the
  frontend proxy hides real client IPs. `pkg/middleware.AttemptLimiter` counts **failures** per
  identifier, so a successful sign-in clears them, and `AuthHandler.Login` answers `429` with
  `Retry-After` (10 failures / 15 minutes, `loginMaxFailures` and `loginFailureWindow`) before
  the password is looked at. An identifier no account owns locks identically, so the lock
  cannot be used to enumerate accounts, and it never touches other accounts. Registering stays
  on the peer limit. Trusting `X-Forwarded-For` was rejected rather than overlooked: Next.js
  fills that header in only when the client did not send one, so a forged value survives.
- [x] **P1** Write down the CSRF reasoning instead of adding a token: the `SameSite=Lax`
  session cookie plus the middleware's `Origin`/`Sec-Fetch-Site` rejection of every non-GET
  request from another origin, documented in `DEPLOYMENT.md`. A token would change every
  mutating call without adding a property those two controls do not already provide.
- [x] **P1** Run `npm audit` and `govulncheck ./...`, then fix or justify each finding in CI.
  Closed 2026-09-28: both scanners run in `.github/workflows/ci.yml`, and each finding is
  justified in `DEPLOYMENT.md` under "Dependency advisories". `govulncheck` is blocking,
  because it only fails on a vulnerability the code actually reaches; its three findings are
  standard-library issues (`crypto/tls`, the unencrypted HTTP/2 `net/http` check,
  `encoding/asn1` recursion) fixed in **go1.26.6**, and both the Dockerfile base image and CI
  take a current 1.26 patch — so the finding means "build with an up-to-date toolchain", not
  "change the code", and pinning an older patch would keep it. `npm audit` is reported, not
  enforced: it lists 4 high and 1 critical, all inside Next.js tooling, and its only fix is
  `npm install next@16.3.6`, outside the pinned range (tracked below). None is reachable in
  this deployment — the two Next.js RCEs need a Windows host or the AVIF
  image-optimisation endpoint, and no component uses `next/image`, so `sharp` and the
  optimiser are dead paths; `postcss` and `js-yaml` run only at build time over our own CSS
  and config; `nanoid`'s advisory needs a caller passing a size of zero. Superseded
  2026-09-28: the framework bump cleared all five findings, so the audit step in CI now
  enforces `--audit-level=high` instead of reporting it — the justifying above is kept only as
  the record of why they were not fixed sooner.
- [ ] **P2** Harden uploads further: re-encode images or serve them with
  `Content-Disposition: attachment` and a restrictive CSP so an HTML/SVG payload cannot be
  used for stored XSS.
- [x] **P2** Add password change / reset (not required by the spec, required by any real
  deployment). Closed 2026-09-28 for **change**; **reset stays open by decision** — see the note
  under this item. `PUT /api/v1/users/me/password` takes `currentPassword`, `newPassword` and
  `confirmPassword` as JSON, applies the register strength rules through one shared
  `ValidatePassword` (so the two forms cannot drift), refuses a wrong current password with its own
  message rather than the sign-in one, and answers the standard error envelope otherwise. The UI is
  a `ChangePassword` dialog on your own profile, built on the theme tokens and the same focus
  contract as `EditProfile`. Verified: `go build`/`vet`/`test ./...` pass, including
  `cmd/password_change_test.go` (happy path, four rejected payloads that leave the stored hash
  untouched, wrong current password, unauthenticated 401, wrong method 404, and both directions of
  the credential swap) and the `ErrWrongPassword` row in the handler status table; `npm run lint`
  (0 errors) and `npx tsc --noEmit` are clean, `npm run build` succeeds, and the browser suite
  passes **26 steps** with the new journey — the dialog flags a mismatched confirmation and keeps
  its submit disabled, closes on success, the tab keeps working on the rotated cookie, which is
  still HttpOnly, and the seeded password is restored at the end.
  **Reset is not implemented and should not be claimed:** it needs mail delivery, and this project
  has no mailer, no SMTP dependency and no outbound mail anywhere. Adding it properly means an
  email provider, a single-use token table with short expiry, and the wording of the message — a
  feature in its own right, not a variation of this one. Recorded here so the gap is visible
  instead of implied by the word "reset".
- [x] **P2** Rotate the session token on privilege change and on password change. Closed
  2026-09-28 with the reduction stated rather than glossed: this app has no roles or permission
  levels, so there is no other privilege transition to hook — the credential change is the only
  one, and it now rotates. `AuthService.ChangePassword` generates the replacement token through
  `SessionManager.CreateSession`, which is already the revoke-and-issue step: `SaveSession` deletes
  every other session row of that account inside the same transaction that inserts the new one, so
  a stolen cookie stops working immediately rather than at expiry, and the browser that made the
  change keeps working because the handler returns it the new cookie. Writing the test found a real
  bug in the in-memory cache: `CreateSession` evicted only the token in `UIDToToken`, so a token
  that had been re-cached from the database — exactly what a process restart leaves behind — stayed
  valid after its row was deleted. It now evicts every cached token of that account, pinned by
  `TestCreateSessionEvictsTokensRecachedFromTheStore`. The integration test writes a second session
  row for one account (the login flow cannot produce two) and asserts it is gone from the table and
  answered 401 over HTTP, that the pre-change cookie is 401 too, and that the response's cookie
  still works. One consequence is documented rather than hidden: an open WebSocket for the revoked
  browser survives until that tab's next request 401s, at which point the client's session-expired
  handler clears the user and drops the socket (`DEPLOYMENT.md`).
- [ ] **P2** Password reset by email. Split out of the item above on 2026-09-28 so it stays
  visible instead of being implied by the word "reset". The backend has no mailer and no SMTP
  dependency, so this is a feature rather than a variation: choose a provider, add a
  `passwordReset` table holding a hashed single-use token with a short expiry (15-30 minutes),
  send the link, and keep the token single-use and bound to one account. The change flow above
  already does the hard part — verify, rehash, rotate, revoke the account's other sessions — so
  the reset endpoint can reuse it, but it must not ship without rate limiting and without an
  answer that cannot be used to discover which addresses are registered.

## Reliability and UX

- [x] Responsive shell with a collapsible desktop sidebar and a focus-trapped mobile
  drawer (`SideBar.tsx:22-46`), plus loading/empty/error components used across pages
  (`Loading`, `RequestState`, `error.tsx`, `not-found.tsx`).
- [x] Failures are reported with `react-hot-toast` rather than inline blocks, per the
  recent refactor commits (`ae86292`, `c4b5a46`, `4483030`).
- [x] **P1** Media and upload edge cases: files over the 51 MiB cap, zero-byte files, an
  extension that disagrees with the detected MIME, and orphaned `media` rows when the
  referencing post, comment, story or message is deleted. Closed 2026-09-28: the size
  violations now answer **413** (the request was well formed, it was simply too large) with a
  message naming the limit — the 50 MB file ceiling and the 10 MB image ceiling are separate,
  and a body past the request ceiling is caught through `http.MaxBytesError`; an empty file
  answers 400 with `ErrEmptyUpload` instead of a bare "bad request". The type contract is now
  stated and pinned rather than incidental: the filename and extension are never read, the
  client's `Content-Type` is ignored, and the stored/served type comes from
  `http.DetectContentType` plus `image.DecodeConfig`, so a PNG named `.gif` is served as
  `image/png` and an HTML or PDF payload with an image extension is refused. Orphaned rows are
  handled by a collector (`pkg/app/repositories/MediaRepository.go` +
  `pkg/app/handlers/MediaCleanup.go`) that deletes every media row no live row references —
  checked across all eight referencing surfaces — together with its file, and sweeps
  UUID-named strays; it runs at boot and hourly from `cmd/main.go` with a 24-hour grace window
  (`handlers.MediaGrace`) so an upload that has not been attached yet is safe, and an expired
  story releases its media because it can never be served again. Evidence:
  `cmd/media_upload_test.go` (413 for both ceilings, 400 for an empty file, the sniffed type
  served with `nosniff`, HTML/PDF refused, and a sweep after deleting each of a post, a
  comment, a story and a message, plus the never-attached upload, the stray file and an
  expired story), the 413 fixture in `cmd/group_management_test.go`, and a browser step in
  `frontend/scripts/integration-smoke.mjs` that posts the empty-file and lying-extension cases
  through the Next rewrite. The two size ceilings deliberately stay out of the browser: this
  harness intercepts every request with `Fetch.enable`, and a body in the tens of megabytes
  wedges the harness before its reply reaches the script (seen at 11 MB, then again at 50 MB),
  while the rewrite itself was measured forwarding 50 MB into a 413 in 0.11s by hand — the
  missing coverage is harness reach, not application behaviour. Documented in `DEPLOYMENT.md`.
- [x] **P1** Audit the `postVisibility` SQL fragment over every read path: feed, single post,
  profile posts, likes tab, comments and direct media. All six were already covered by the one
  fragment, and the audit found the one surface that was not: **reactions**. `UpsertReaction`
  checked existence only, so any signed-in user could read a private post's score, change it,
  and use 200-vs-404 as an existence oracle for posts and comments; `CanViewPost`, the helper
  written for that check, had no callers at all. It now runs through `reactionTarget` next to a
  new `CanViewComment` (comment → its post) and answers 404 for an unreadable target, and the
  dead `DoesCommentExists` is gone. Evidence: `cmd/post_visibility_test.go` walks the fragment
  as the owner, the chosen follower, a stranger and a later follower, and asserts a rejected
  reaction leaves the score untouched.
- [x] **P1** Settle the selected-audience-after-unfollow question: **`selected` is a grant, not
  a live relation.** The spec separates "almost private (only followers of the creator)" from
  "private (only the followers chosen by the creator)", so `followers` tracks the `follow`
  table while `selected` records who the author picked when the post was written; unfollowing
  later does not revoke it, a follower arriving later never gains it, and the author's lever is
  editing the post, which re-validates against current followers and rewrites the list (a
  now-unfollowed member cannot be kept, and `ValidateSelectedFollowers` refuses a non-follower
  in the first place). Pinned by `TestSelectedAudienceIsAGrantNotALiveRelation` and documented
  on the fragment itself. Deliberate exceptions recorded rather than changed: avatars, group
  images and story media are readable by any authenticated user (they back the avatar, the
  group directory and the stories strip, which all carry no audience), and a cover photo needs
  a public profile or a follow.
- [ ] **P2** Decide whether stories need an audience. They are listed to, and their media is
  readable by, every signed-in user: the audit found no privacy field on the `story` table and
  no audience check in the story branch of `CanViewMedia`. The spec's story requirement does not
  mention privacy, so this is a decision to record rather than a bug to fix silently.
- [x] **P1** Add error, empty and loading states for the new P0 flows (follow requests,
  comment media) following the toast convention. Progress 2026-09-28: the comment composer
  reports upload and validation failures with `react-hot-toast`, its list already had a
  spinner plus `LoadMore`, and the profile media tab now has a skeleton and a "No photos yet."
  empty state; the follow-request half is unchanged. Closed 2026-09-28: the follow-request
  half turned out to be almost complete already — `notifications/page.tsx` renders a
  `RowsSkeleton` while the list loads, a `RequestState` when it is empty, and a `LoadMore`
  for the next page, and a failed request is reported by the shared `usePagedList` hook with a
  toast that carries its own retry, which is the convention this file records. The one real
  gap was honesty, not coverage: a failed load also rendered "No pending follow requests." and
  "You're all caught up.", so both empty states are now gated on `!error`, matching what the
  newest pages already did (`page.tsx`, `discover/page.tsx`, `profile/page.tsx`).
- [x] **P1** Reconnect/offline UX: `BackendProvider.tsx:94` retries the socket every 3 s with
  no visible state — surface the existing `connected` context value in the UI. Closed
  2026-09-28: the direct conversation already showed a local dot, but nothing else did, so the
  provider now tracks a dropped connection and renders one polite status banner inside `main`
  ("Reconnecting… new messages and notifications may be delayed"), which the rest of the app
  inherits. It is deliberately set only after a socket that had been open closes, so a cold
  start does not flash a warning before the first handshake, and a failure to connect at all
  keeps going to the existing "Couldn't connect" screen with its Reconnect button.
- [x] **P1** Accessibility pass: apply the drawer's focus trap and Escape handling to
  `EditProfile`, `StoriesBar` and `GroupConversation` dialogs; confirm `aria-live` on the
  unread badge; check colour contrast on the teal/blue gradients. Closed 2026-09-28: the
  drawer's keyboard contract is now a reusable hook, `frontend/src/app/lib/useDialogFocus.ts`
  — focus moves into the dialog on open (an optional `initialFocus`, else the first control),
  Tab and Shift+Tab cycle inside it, Escape closes it, the page is frozen and focus returns to
  the trigger. It is applied to `EditProfile`, both `StoriesBar` dialogs (`CreateStory` starts
  in its text field, the story viewer on its close button), the `GroupConversation`
  leave/delete confirmation (inline, so `lockScroll` is off and `enabled` installs the trap
  only while it is open) and `FollowListModal`, the other real overlay, which previously had
  none of this. The unread badges were the weak part of the `aria-live` story: the badge was
  inserted *with* its number, and a live region has to exist before its text changes or the
  first announcement can be missed, so the region is now the always-mounted wrapper and the
  badge inside it appears later. The badge itself keeps its `aria-label`, because that is what
  names it inside the link and what the browser suite reads — an earlier draft moved the count
  into a separate visually-hidden region, which would have quietly invalidated five assertions
  in `integration-smoke.mjs`, so the wrapper was the better shape. Contrast was measured rather
  than eyeballed and three combinations failed AA for their text size: white on
  `teal-600`/`teal-500` is ~3.7:1/~2.5:1 and white on `red-500` ~3.8:1, so the messages badge,
  the Create Post and Publish gradients, the story card gradient and the notification badge now
  end on `teal-700`/`red-600` (5.5:1 and 4.8:1). Recorded rather than fixed: `UserCard.tsx` and
  `StoryItem.tsx` carry the same white-on-`blue-500` problem but are imported nowhere, so they
  are dead code (see the housekeeping list).
- [x] **P1** Responsive review at 320 / 375 / 768 / 1440 px for messages, group chat,
  profile, notifications, and the new follow-request screens. Closed 2026-09-28 as an
  automated check rather than a one-off look: the browser suite now drives five surfaces
  (messages, group chat, profile, notifications, discover) through all four widths and
  asserts `document.documentElement.scrollWidth <= window.innerWidth`, reporting the widest
  node when it fails, so the review stays reviewed. It immediately found a real bug: at 768px
  `/discover` overflowed to 807px because a card's generated handle (`@browserminimal…`) had no
  break opportunity and its flex row had no `min-w-0`; the handle now truncates and the bio
  wraps, and the suite is green afterwards. The follow-request surface is covered through the
  notifications page and the profile header, which is where it renders.
- [ ] **P2** Replace the `dummyUserData` / `dummyMessagesData` fallbacks in
  `frontend/public/assets.ts` with real empty states, then delete the unused exports.
- [ ] **P2** Optimistic updates for follow/unfollow and reactions to avoid a full refetch
  on every click.
- [ ] **P2** Localise `dateLabel` and relative timestamps.
- [x] **P2** Infinite-scroll ("load more") affordance for the feed: `LoadMore.tsx` +
  `usePagedList.ts`, and every other paged surface (comments, stories, profile, discover,
  notifications, group content, chat history, group list). `Pagination.tsx` is gone.
- [x] **P2** Pagination covers stories and profile media, not just posts: both now grow from
  the same hook, and the stories strip pages horizontally.

## Deployment and Documentation

- [x] `backend/Dockerfile` and `frontend/Dockerfile`: multi-stage builds, non-root users,
  separate `social-network-backend` / `social-network-frontend` images.
- [x] `compose.yaml`: `social-data` named volume, migrations auto-applied on boot, only port
  4000 published (bound to loopback), `restart: unless-stopped`.
- [x] `DEPLOYMENT.md` documents `APP_ENV`, `FRONTEND_ORIGIN`, `DATABASE_PATH`, `UPLOAD_DIR`,
  `PORT`, `LOG_LEVEL`, rate limits, body limits, and backup/rollback guidance.
- [x] Local developer launcher: `run.sh` plus `scripts/run-wsl.sh`, with port-conflict
  checks and child-process cleanup.
- [x] **P1** Add a root `.env.example` (`APP_ENV`, `FRONTEND_ORIGIN`) — `DEPLOYMENT.md:9`
  instructs the reader to create a root `.env` that is not scaffolded anywhere.
- [x] **P1** Rewrite the top-level `README.md`: it is still the verbatim assignment text and
  never describes what was built, the stack, the folder layout, or how to run it. Closed
  2026-09-28: the assignment text is gone (its requirements are quoted in this file), replaced
  by what the app does, the stack table, the folder layout, Docker and local run instructions,
  the check commands, the privacy rules worth knowing before changing code, and a map of the
  other documents.
- [x] **P1** Document the `frontend/src/proxy.ts` middleware and the `/api/v1` + `/ws`
  rewrite contract in `frontend/README.md` (currently only partially covered). Closed
  2026-09-28: a "Same-origin proxy" section now explains both mechanisms — the two rewrites in
  `next.config.ts`, the build-time `BACKEND_URL` (and why changing it means rebuilding the
  frontend image), `proxyClientMaxBodySize` and the 51 MiB body ceiling — and the page-gate
  middleware, including its matcher excluding `/api/*` and `/ws` so it never buffers an upload
  or a socket upgrade, and the fact that it is a convenience rather than the access check.
  The same file's claim that a backend restart signs everyone out was stale since sessions
  moved into the database, and is corrected.
- [x] **P1** Add CI (GitHub Actions or the school equivalent) running `go vet`, `go test`,
  `npm ci`, `npm run lint`, `npm run build`, `docker compose build`, `npm audit`. Closed
  2026-09-28: four jobs — backend (`go build`/`vet`/`test`), frontend
  (`npm ci`/`lint`/`npx tsc --noEmit`/`build`/`npm audit`), `govulncheck`, and a Compose job
  (`docker compose config` + `build`) that waits on the first two. Go `1.26.x` and Node `22`
  mirror the two Dockerfiles, a concurrency group cancels superseded runs, and each job's comment
  says why it is scoped the way it is. Two corrections made on 2026-09-28 after measuring rather
  than trusting this line: `npm audit` stopped being a reported step when the framework bump
  cleared every advisory (this line still described it as reported), and the claim that "the
  implementation lives on GitHub" was wrong — `git remote -v` shows a single remote, the school's
  GitLab, so the GitHub Actions file never had a host to run on. `.gitlab-ci.yml` now carries the
  same four jobs for the host this repository is actually pushed to; see that item in Testing and
  Release.
- [x] **P2** Bump Next.js past the audit advisory: `16.2.12` is pinned and `npm audit` wants
  `next@16.3.6` (see Authentication and Security for why the current findings are not
  reachable). After the bump, re-run lint, `npx tsc --noEmit`, `npm run build` and the browser
  suite, then the audit step can stop being report-only and the `next/image` item below is
  unblocked. Closed 2026-09-28: `next` and `eslint-config-next` are both at **16.3.6** (still
  pinned exactly) and the lockfile was refreshed; `npm audit` went from four high and one
  critical to **0 vulnerabilities**, with `postcss`, `sharp` and the two remaining highs
  (`js-yaml`, `nanoid`) cleared — the last two by an in-range `npm audit fix`, no `--force`.
  Verified with `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build` and the full
  browser suite, which passed 24 steps against `Next.js 16.3.6 (Turbopack)` with no runtime
  exceptions. CI's audit step is blocking now, and the bump surfaced one new lint warning
  (`no-location-assign-relative-destination` at the logout handler), answered with an
  explanation rather than a behaviour change: a full reload there is what drops the socket.
- [ ] **P2** Wire the browser smoke suite into CI: `npm run test:integration` needs Chrome on
  the runner (`CHROME_PATH`), builds both services and takes several minutes, which is why the
  workflow leaves it out for now. Sharpened 2026-09-28: the runner needs Go, Node *and* a Chrome
  binary in one image, because `scripts/run-integration.mjs` shells out to `go build` for the
  backend and spawns the Next.js dev server itself before driving the browser over the DevTools
  protocol. On GitLab that is one job on `node:22-bookworm` with the Go toolchain and `chromium`
  installed and `CHROME_PATH` pointed at it — worth adding as an opt-in job (`when: manual`) first
  so a flaky browser run cannot redden every pipeline. Still open: running it needs a runner, and
  it was not attempted blind.
- [x] **P2** Mirror `.github/workflows/ci.yml` for the school's GitLab if that is where the
  project is graded. Closed 2026-09-28, and it turned out to matter more than a mirror:
  `git remote -v` has exactly one remote, `https://learn.reboot01.com/git/saabdulla/social-network.git`,
  so **the GitHub workflow has never had a host to run on** — until now the repository had no CI
  that could execute at all. `.gitlab-ci.yml` now runs the same four jobs (`backend`, `frontend`,
  `govulncheck`, `containers`) with the same commands, verified by comparing the two files'
  command lists programmatically rather than by eye: all four match, with two mechanical
  differences that have no counterpart without the `setup-go`/`setup-node` actions and are
  commented in place (`npm ci --cache .npm-cache --prefer-offline`, and
  `$(go env GOPATH)/bin/govulncheck` after `go install`). Caches are keyed on `go.sum` and
  `package-lock.json` and live under `$CI_PROJECT_DIR/.cache` because GitLab only caches inside
  the project directory. Two things are recorded rather than hidden: the `containers` job uses
  `docker:27` with a `docker:27-dind` service (the image ships the compose plugin in
  `/usr/local/libexec/docker/cli-plugins`, confirmed from the image's own Dockerfile) and is set
  `allow_failure: true`, because a runner that permits a privileged service cannot be assumed —
  it is blocking on GitHub and should be flipped here once a pipeline shows DinD working; and the
  file itself has not been executed, because that needs the school's runner.
- [x] **P1** Run and record a real backup → wipe → restore drill of the `social-data` volume
  using `sqlite3 .backup`, and verify uploaded media is included. Closed 2026-09-28:
  `scripts/backup-restore-drill.sh` now performs the whole cycle against a throwaway directory
  and asserts it — build, register an account, upload a photo, attach it to a post, back up the
  live database with `sqlite3 .backup` plus the upload directory, stop the server, delete the
  data directory, restore both halves, restart, and check that the pre-wipe session cookie still
  authenticates, the account and post come back, the photo is served byte-for-byte, and the row
  and file counts match the pre-wipe ones (1 user, 1 post, 1 media row, 1 session, 1 file). It
  passed on the first run. `DEPLOYMENT.md` records the drill, the exact commands, the result and
  the Docker-on-a-volume equivalent — with the caveat that the Docker half is reviewed but was
  not executed, because the environment had no Docker daemon.
- [ ] **P2** Verify `docker compose config` and a full `docker compose up --build` on a clean
  host; record the first-run steps and the expected log lines in `DEPLOYMENT.md`.
- [x] **P2** Add health/readiness endpoints and container healthchecks (`compose.yaml`
  currently relied only on `depends_on`). Closed 2026-09-28: `GET /api/v1/health` is liveness and
  never touches the database; `GET /api/v1/ready` pings SQLite with a two-second ceiling and answers
  `503` with the standard error envelope when it cannot. Both live in `HealthHandler.go` and are
  registered unauthenticated in `cmd/router.go`, so the same URL answers directly and through the
  frontend proxy. Both images now install `curl` and carry a `HEALTHCHECK` on `/api/v1/ready` every
  10 seconds, and `compose.yaml` replaced the bare `depends_on` list with
  `condition: service_healthy`; the frontend's probe goes through its own rewrite, so it only passes
  when the proxy and the backend are both answering. `cmd/health_test.go` pins the two probes apart
  — closing the database leaves `/health` at 200 while `/ready` turns 503 — and the new cases in
  `handlers_test.go` pin that a context with no database, or a nil one, fails closed instead of
  panicking. Verified with `go build ./...`, `go vet ./...` and `go test ./...`. **Not verified:
  `docker compose up --build`** — this environment has no Docker daemon, so the `HEALTHCHECK` lines
  and the `service_healthy` gate are reviewed rather than executed; `DEPLOYMENT.md` records both and
  says so.
- [ ] **P2** Guard the build-time `BACKEND_URL` coupling (`DEPLOYMENT.md:5`) with a
  build-time assertion, or move to runtime configuration.
- [ ] **P2** Pin image digests and Go/Node patch versions for reproducible builds.
- [ ] **P2** Ship a sample reverse-proxy config (Caddy or nginx) showing Host/Origin
  preservation and the WebSocket upgrade for `/ws`.

## Testing and Release

- [x] `go test ./...` passes. Integration tests exist under `backend/cmd` for auth, posts,
  comments, conversation regressions, group content, group management, post editing, and
  security.
- [x] `frontend/scripts/integration-smoke.mjs` drives real Chrome through
  `npm run test:integration` against an isolated database under `backend/tmp`.
- [x] `go vet ./...` is clean.
- [x] **P1** Add direct tests for the packages that have none: `pkg/app/handlers`,
  `pkg/app/repositories`, `pkg/middleware`, `pkg/websocket` — they were only exercised
  indirectly through `cmd/*_test.go`. Closed 2026-09-28, all four covered.
  `pkg/app/handlers/handlers_test.go` pins the whole `HandleError` status contract as a table —
  including that a size violation is 413 rather than 400 and that a 500 never leaks the
  underlying error text — plus `allowedOrigin`, the WebSocket handshake gate, and `isASCII`.
  `pkg/websocket/hub_test.go` covers fan-out to every socket of one user and nobody else,
  presence following the first and last socket, the online and offline announcements,
  `BroadcastToAll` and `Stop` closing every channel. `pkg/app/repositories/SocialRepository_test.go`
  migrates a scratch database and tests the two pieces of SQL this file leans on hardest: the
  collector's orphan query across all eight surfaces, with each reference released one at a
  time, the grace window asserted from both sides and an expired story counted as released, and
  the media access rule branch by branch, next to the chat rule and
  `ValidateSelectedFollowers`. `pkg/middleware/middleware_test.go` adds `AuthMiddleware` — no
  cookie, an unknown token, a live token, the cookie cleared on rejection, and the account
  reaching the handler through the context. The websocket and middleware packages also pass
  under `-race`.
- [x] **P1** Cover every P0 flow with tests: follow requests, comment media, chat permission
  rules, register field parity, notification type separation, and session persistence.
  Closed 2026-09-28: all six have Go coverage — `cmd/follow_request_test.go`,
  `cmd/comment_media_test.go`, `cmd/chat_permission_test.go`, `cmd/register_fields_test.go`,
  `cmd/notification_types_test.go` and `cmd/session_test.go`.
- [x] **P1** Extend the browser smoke suite to the follow-request and comment-image journeys.
  Closed 2026-09-28: the follow-request, comment-image, notification/message badge and signup
  journeys all run in the browser suite.
- [x] **P1** Add a migration test that runs `up` → `down` → `up` over all ten migrations on
  a scratch database. `backend/pkg/db/sqlite/migrations_test.go` does exactly that, checks
  that 000009 keeps existing session rows, and asserts the 000010 comment media column
  survives the round trip.
- [x] **P2** Add a WebSocket test for private-message delivery plus rejection of a
  non-permitted sender. Closed 2026-09-28: `TestPrivateMessageSocketDelivery` in
  `cmd/chat_permission_test.go` drives two live sockets through the real hub. It asserts that the
  recipient receives an `incoming_msg` whose payload matches the stored row (id, sender id, sender
  nickname, text and timestamp), that the sender's own second socket receives the same echo, that
  the unread notification is pushed and points at that message id, that `open_chat` marks it read
  and suppresses the badge for the next message while still delivering it, and that a frame from a
  non-permitted sender is neither delivered, stored nor notified — measured on fresh sockets,
  because a read deadline leaves a connection unusable. The sync points are real side effects (the
  message row count and the unread-notification count) rather than fixed sleeps, and the test
  passes under `-race`. The storage half of the same rule was already covered by
  `TestPrivateMessageSocketRespectsTheChatRule`, which this test leaves in place.
- [ ] **P2** Load smoke: 50 concurrent WebSocket clients and sustained request throughput
  through the frontend proxy, confirming the rate limiter behaves.
- [x] **P2** Add `npm run lint` and `npm run build` to the definition of done for every PR.
  Closed 2026-09-28 as part of the CI work: `.github/workflows/ci.yml` runs both on every push
  and pull request, so a branch that breaks either cannot merge without a visible failure.
- [x] **P2** Record the release checklist (build, migrate, backup, deploy, verify, rollback)
  in `DEPLOYMENT.md`. Closed 2026-09-28: a *Release checklist* section does exactly that in six
  ordered steps, each naming the command that answers it, with the reasons the order matters —
  the backup has to precede the automatic migrations, and verification has to happen while the
  previous version is still available. Two parts are called out because they are the ones that
  get skipped: the backup is both halves (database plus uploads) taken with the writer stopped,
  and rollback is both halves too, since redeploying the old binary across a new migration leaves
  it reading a schema it does not expect — so the step-2 backup is the way back, not a volume
  deletion.

## Housekeeping and Cleanup

- [x] **P0** Untrack the live SQLite database. `backend/pkg/db/socialnetwork.db` is committed
  and shows as modified in `git status`; add it to `.gitignore` (which currently only
  ignores `realTimeForum.db`) and `git rm --cached`.
- [x] **P1** Delete dead code: `frontend/src/app/components/MenuItems.tsx` (never imported)
  and the unused `menuItemsData` / `dummy*Data` exports in `frontend/public/assets.ts`.
  `MenuItems.tsx`, `menuItemsData` and the lucide import it needed are gone. The `dummy*`
  fixtures stay for now because `dummyStoriesData` is still imported by `StoryCard` and
  `StoryCarousel`; they go with the empty-state work above.
- [ ] **P3** Delete the two remaining unimported components: `frontend/src/app/components/StoryItem.tsx`
  and `UserCard.tsx` are referenced by nothing (a grep for either name returns only the files
  themselves) and still build on the older `types/story` shape. They were noticed during the
  accessibility pass because both put white text on a `blue-500` gradient (~3.7:1, below AA);
  deleting them is the right fix rather than recolouring dead code.
- [ ] **P3** Run `gofmt` over the files it does not currently accept. Corrected 2026-09-28 after
  measuring instead of trusting this line: `cd backend && gofmt -l .` lists fourteen files, not two.
  Only three have a real formatting problem — `pkg/websocket/types.go` (misaligned struct tags and
  continuation lines), and `pkg/app/service/ReactionService.go` with
  `pkg/app/service/SessionManager_test.go` (space-indented imports). The other eleven, including
  `pkg/app/handlers/ReactionHandler.go`, differ only by a missing final newline, which the previous
  revision described as misaligned tags without opening the diff. Every file added or touched since
  (including `cmd/*_test.go`, `HealthHandler.go` and the new tests) is clean. Left alone a third
  time on purpose: a whitespace-only change across fourteen files would bury the health-endpoint and
  test diff it would land with. It is one command — `cd backend && gofmt -w $(gofmt -l . | grep -v tmp/)` —
  and it belongs in its own commit.
- [x] **P1** Remove the stale Clerk and `NEXT_PUBLIC_DEV_USER` references listed under
  Authentication and Security.
- [ ] **P1** Keep this file current. The previous revision marked shipped features (group
  chat, group events, both Docker images) as unchecked while omitting the real gaps, which
  is worse than having no TODO at all.
- [x] **P2** Decide the fate of the legacy redirect-only routes: `frontend/src/app/connections/page.tsx`
  and the `follows` entry still present in the stale `.next-smoke` build output. Decided
  2026-09-28: **keep `/connections`, and nothing else needs deciding.** The history settles both
  halves — `fb7e825` added this file *as* a redirect ("Redirect the legacy connections URL to the
  profile"), and `dc453f6` removed the standalone follows page outright, so the `follows` entry the
  item mentions was only ever a build artifact of a route that no longer exists (and the artifact
  itself is gone with the directory, below). Keeping it costs five lines and saves every old link
  and bookmark; deleting it would break them for no gain. The reason now lives in the file rather
  than in a commit message, and the decision is tested in both directions: the anonymous sweep
  proves the session gate fires for `/connections`, and a new signed-in step proves the redirect
  actually lands on `/profile` (`PASS: the legacy connections URL still redirects to the profile`).
  That second assertion was the real gap — "keep it" was previously unverified.
- [x] **P2** Confirm `.next/`, `.next-smoke/`, `backend/tmp/` and `backend/uploads/` stay
  untracked (verified: only the database is currently tracked) and add them to
  `.gitignore` explicitly rather than relying on the `tmp` pattern. Closed 2026-09-28 by
  correcting the premise instead of changing the file: they are **already explicit**, and there are
  two tracked ignore files rather than one. `git check-ignore -v` names the rule for every path —
  `frontend/.gitignore` (itself tracked) covers `/node_modules`, `/.next/`, `/.next-smoke/`, `.env*`,
  `*.tsbuildinfo` and `next-env.d.ts`, while the root `.gitignore` covers `backend/tmp/`,
  `backend/uploads/` and the database files — and `git ls-files` returns nothing for any of them, so
  no generated artifact is tracked. Two things this measurement turned up: `frontend/.env.local` is
  ignored by the `.env*` rule while `.env.example` is tracked and not ignored, which is the right way
  round; and nothing here relies on the `tmp` pattern, which was the item's assumption.
- [x] **P2** Review `frontend/scripts/run-integration.mjs` versus
  `scripts/run-wsl.sh` for duplicated launcher logic and merge what overlaps. Reviewed
  2026-09-28 and the measurement says **there is no shared code to merge** — recorded rather than
  forced. `scripts/run-wsl.sh` (160 lines, bash) is a development launcher: it takes `start|status|stop`,
  serialises concurrent working copies with two flocks and a state file validated against
  `/proc/<pid>/stat`, refuses to start when 4000 or a configured `PORT` is already taken, sources
  nvm for non-interactive WSL shells, heals a missing platform-specific dependency with `npm ci`, and
  keeps both services in `setsid` process groups. `run-integration.mjs` (86 lines, Node) is a test
  harness: random free ports, an isolated database with a copy of the migrations, `go build` for the
  server and seed, per-service log files, HTTP readiness polling, and a kill-tree that also handles
  Windows `taskkill`. Making one call the other would drag fixed ports, flock and a PID state file
  into the harness, or free ports, test-database setup and log capture into the launcher, and would
  leave one of the two platforms untested. What *was* duplicated was intent, not code — "wait until
  the backend can serve" — and that is now expressed through the endpoint built for it: the harness
  polls `/api/v1/ready` for both services (the second one through the frontend's rewrite, so a wrong
  `BACKEND_URL` fails at startup instead of mid-suite) instead of polling an authenticated route for
  a 401. Verified: the next run logs exactly two `GET /api/v1/ready` → 200 requests, one direct and
  one proxied.
- [x] **P2** Delete the generated `.next-smoke` directory from the working tree and document
  `NEXT_DIST_DIR` as the supported way to get a second build directory. Closed 2026-09-28: the
  directory is gone (783 MB) and `frontend/README.md` now says, next to the browser check that
  creates it, that the check builds into `frontend/.next-smoke` because `run-integration.mjs` sets
  `NEXT_DIST_DIR`, that this is what keeps the check out of the development `.next`, and that the
  directory is a cache which the next run recreates. Deleting it is safe in the two places that
  mention it: `tsconfig.json`'s `.next-smoke/types/**` includes match nothing and are simply
  unsatisfied (`npx tsc --noEmit` stays clean), and `eslint.config.mjs` only ignores it. The cost is
  recorded too — the first browser run after this is a cold one — and the recreation is not assumed:
  after deleting the directory (783 MB), a cold `npm run test:integration` passed all **27 steps**
  with no runtime exceptions and rebuilt `.next-smoke` from scratch. Still lying in the tree and
  deliberately left alone: `frontend/.next` (2.8 GB) and `backend/tmp` (1.9 GB), both live caches
  used by the build and the test harness rather than leftovers.

## Nice to have

Polish and product ideas. None of these block the spec; pick them up once P0–P2 are clear.
Ordered roughly by value for effort.

### Composer and preview

- [ ] **P3** Live post preview in `PostForm.tsx`: render the draft exactly as `PostCard` does
  (avatar, handle, timestamp, title, content, image grid, privacy chip), side by side with
  the form on `lg:` and behind a toggle on mobile.
- [ ] **P3** Preview step before publishing, so the author sees the post the way the chosen
  audience will before committing.
- [ ] **P3** Audience banner in the preview: "Visible to your followers", or the selected
  names for `privacy === 'selected'`, plus a note when the post will be hidden from a
  private-profile follower.
- [ ] **P3** Instagram-style modal composer launched from the sidebar and the feed, keeping
  `/create-post` as a deep link (currently the only entry point is
  `Sidebar.tsx:79` → `create-post/page.tsx`).
- [ ] **P3** Draft autosave to `localStorage` so a refresh does not lose a long post.
- [ ] **P3** Show why publishing is blocked ("Add 4 more characters", "Choose a follower")
  instead of a silently disabled button.
- [ ] **P3** Sticky publish button and keyboard shortcut (Ctrl/Cmd + Enter) to publish.

### Media and validation

- [ ] **P3** Fix the WebP gap: `MediaHandler.go:55` skips `image.DecodeConfig` when the MIME
  is `image/webp`, so WebP dimensions and the 40 MP ceiling are never enforced. Decode with
  `golang.org/x/image/webp`, or re-encode WebP on ingest.
- [ ] **P3** Enforce minimum dimensions and aspect ratios per purpose: square avatar at least
  200×200, cover at least 800×300, post media between 1:2 and 2:1.
- [ ] **P3** Client-side downscale before upload (canvas, ~1600 px on the long edge, quality
  ~0.85), skipping animated GIFs so they stay animated. This cuts upload time and storage
  for phone photos, which are the common case.
- [ ] **P3** Show each selected file's dimensions and size in `ImagePicker` before upload, so
  a rejection is never a surprise.
- [ ] **P3** Accept HEIC/HEIF and AVIF on the file input and convert on the client, or reject
  them with a message that names the format.
- [ ] **P3** Single source of truth for the limits (10 MB image, 50 MB video, 40 MP,
  4 attachments) shared by `ImagePicker.tsx`, `MediaHandler.go` and the docs, instead of the
  three copies that exist today.
- [ ] **P3** Return a specific server error ("Image is 12.4 MB, the limit is 10 MB") rather
  than the generic `ErrBadRequest`, and show it verbatim in the toast.
- [ ] **P3** Client-side cropping for avatars, covers and post images (square, 4:5, 16:9).
- [ ] **P3** Generate derivatives on upload (`_thumb`, `_large`) and serve them with `srcset`
  so the feed stops downloading full-resolution originals.
- [ ] **P3** Lightbox viewer with keyboard navigation and swipe, instead of opening the raw
  file in a new tab (`PostCard.tsx:64` uses `target="_blank"`).

### Instagram-like UI

- [ ] **P3** Adopt an Instagram-style shell: slim top app bar with search and the notification
  bell, plus a bottom tab bar on mobile, replacing the off-canvas drawer in `SideBar.tsx`.
  Keep the current sidebar as the `lg:` variant so nothing is lost.
- [ ] **P3** Media-first feed cards: full-bleed media that is square by default, with a row of
  icons (heart, comment, share, save) instead of the up/down vote arrows and text buttons in
  `PostCard.tsx:65`. Keep `POST /api/v1/reactions` underneath so no backend change is needed.
- [ ] **P3** Double-tap to like with a heart burst, wired to the existing reaction endpoint,
  with optimistic state instead of the current refetch.
- [ ] **P3** Story ring with the brand gradient around avatars in `StoriesBar`, plus a
  seen/unseen state driven by `story` rows.
- [ ] **P3** Comment sheet: a bottom drawer on mobile instead of the always-open inline list
  in `PostCard.tsx:41`.
- [ ] **P3** Instagram-style profile header — avatar on the left, posts/followers/following
  stats on the right — and a 3-column square grid replacing `MediaGrid`'s two-column
  `h-48` tiles (`profile/page.tsx:412`).
- [x] **P3** Skeleton loaders for the feed and the profile list (`Skeletons.tsx`,
  `PostListSkeleton`, `CardGridSkeleton`, `RowsSkeleton`); `Loading.tsx` is now a small
  centred spinner that honours its `height` instead of stretching to the viewport.
- [x] **P3** Infinite scroll for the feed and the grid: `LoadMore.tsx` observes a sentinel and
  keeps a real button for keyboard and screen-reader users. The remaining work is
  virtualising very long lists (see the performance section).
- [ ] **P3** Sticky feed header with a "new posts" pill that appears when posts arrive over
  the socket, instead of a full reload.
- [ ] **P3** Move the remaining hardcoded Tailwind values into the `@theme` block in
  `frontend/src/app/globals.css` (radius, shadow, spacing, `--color-ring`) so restyling is a
  one-file change. The `chat-*` component classes there are the model to follow.
- [ ] **P3** Dark mode from a `prefers-color-scheme` token set, with the toggle persisted.
- [ ] **P3** "People you may know" rail on the feed, built from `GET /api/v1/users`.
- [ ] **P3** Empty-state illustrations for the feed, notifications, messages and groups
  instead of plain text.

### Product extras

- [ ] **P3** Bookmarks / saved posts with a Saved tab (small migration plus a private list).
- [ ] **P3** Hashtags and @mentions: linkify them in posts, comments and chat, plus a hashtag
  results page. Do this after P0-2, since `CommentHandler.go:114` currently rejects
  non-ASCII comments.
- [ ] **P3** Reposts and quote posts in the feed.
- [ ] **P3** Unified search across posts, groups and users in one results page, with recent
  searches kept locally.
- [ ] **P3** Mute and block a user, enforced in the feed, profile, chat and notifications.
- [ ] **P3** Story replies and a "seen by" list; archive expired stories instead of letting
  the row disappear.
- [ ] **P3** Chat extras: message reactions, an image lightbox, voice notes, and a shared
  media tab per conversation.
- [ ] **P3** Activity digest — a weekly summary email or in-app card of followers, comments
  and group activity.
- [ ] **P3** Web push notifications through a service worker for backgrounded tabs.
- [ ] **P3** Post analytics for the author: reach per privacy level, reactions over time.

### Performance and quality

- [ ] **P3** Use `next/image` for `Avatar` and post media (the `remotePatterns` block in
  `next.config.ts` already exists) instead of raw `<img>` tags, to get responsive sizing and
  lazy loading for free. The security blocker is gone — Next.js is 16.3.6, so the advisory that
  named the image-optimisation API no longer applies — but a design problem replaced it: every
  image this app renders is authenticated media behind `GET /api/v1/media/{id}`, and the
  optimiser fetches that URL server-side *without the viewer's cookie*, so it would receive a
  401 and render nothing, while its cache is keyed by URL alone and would hand one viewer's
  private photo to the next request. Adopting `next/image` therefore means `unoptimized` for
  anything private (which forfeits the point) or signed per-viewer media URLs. Do it for
  genuinely public images first, or not at all; the 26 `no-img-element` warnings are the
  standing reminder.
- [ ] **P3** Virtualise long comment and chat lists, which currently render every loaded item.
- [ ] **P3** Deduplicate requests: `/users/me` and `/users/me/follows` are fetched separately
  by several components on the same page (`PostForm.tsx:23`, `SideBar.tsx:47`).
- [ ] **P3** Add a Lighthouse / Core Web Vitals budget and enforce it in CI.
- [ ] **P3** Add bundle-size reporting to the frontend build.
- [ ] **P3** Add indexes for the queries introduced by the follow-request and comment-media
  work, and review the feed query with `EXPLAIN QUERY PLAN`. Progress 2026-09-28: 000010 adds
  `comment_userId` for the profile media query; the follow-request side and the feed review
  are still open.
- [ ] **P3** Add a component gallery (Storybook or a `/dev/components` route) so the
  Instagram-style redesign can be reviewed without clicking through whole flows.

### Developer experience

- [ ] **P3** Extend `backend/cmd/seed/main.go` with realistic demo data — users, follows,
  posts with media, groups, conversations — and document a single `make seed` command.
- [ ] **P3** Generate an OpenAPI document or an HTTP collection from `backend/cmd/router.go`
  so the API can be exercised without the UI.
- [ ] **P3** Add per-branch preview deployments.
- [ ] **P3** Add a `make` (or `just`) file wrapping the commands already spread across
  `run.sh`, `DEPLOYMENT.md` and this file.
- [ ] **P3** Document the WebSocket message protocol (`backend/pkg/websocket/types.go`) in
  `backend/README.md`: event names, payload shapes and direction of travel.

## Work in flight and handoff

The paginated-feed rework is **committed on `main`** (`950bbdf`…`e6594fe`) and validated
(`npm run build` clean, `npm run test:integration` green on 2026-09-28): `LoadMore.tsx`,
`Skeletons.tsx` and `usePagedList.ts` are the new list primitives, and `Pagination.tsx` is
gone (grep for it returns nothing). Treat the list files as settled unless a task explicitly
targets them, and ignore any older bullet that mentions keeping `Pagination` as a fallback.

The theme/dark-mode rework that shared this tree is **committed too** (`19b694c`…`04e7110`):
`ThemeProvider.tsx`, `ThemeToggle.tsx` and `lib/theme.ts` are new, and `BackendProvider.tsx`,
`SideBar.tsx`, `layout.tsx`, `globals.css` and `login/page.tsx` were touched. Its tokens
(`bg-card`, `border-border`, `text-muted`, `bg-surface-2`, `text-brand-1`, the `chat-*`
component classes) are the ones to build on.

- P0-5 (register field parity) is complete; it touched `login/page.tsx`. The avatar is
  attached with a `PUT /users/me` straight after signup, because `POST /media` needs the
  session that registering creates — do not "simplify" that into a register field.
- P0-4 (notification vs message split) is complete; it touched `SideBar.tsx` and
  `notifications/page.tsx`.
- P0-2 (comment media) is complete; it touched `PostCard.tsx` and `profile/page.tsx`.
- P0-3 is complete on the backend; the only missing piece is the frontend guard, handed off
  with the exact change list in that section. `canMessage` is still only a type in
  `frontend/src/app/api/social.ts`, so nothing reads the flag yet.
- No P0 items are open. What is left is the P1/P2/P3 list above.

Changed in the group-events session (2026-09-28), for review:
`backend/pkg/db/migrations/sqlite/000011_event_reminder.{up,down}.sql` (new),
`backend/pkg/models/GroupContent.go`, `backend/pkg/app/repositories/GroupContentRepository.go`,
`backend/pkg/app/handlers/GroupContentHandler.go`, `backend/pkg/app/handlers/GroupEventReminders.go` (new),
`backend/cmd/main.go`, `backend/cmd/group_events_test.go` (new),
`backend/pkg/db/sqlite/migrations_test.go`, `frontend/src/app/components/GroupActivity.tsx`,
`frontend/scripts/integration-smoke.mjs`, `README.md`, `DEPLOYMENT.md`, `TODO.md`.

The second half of the Groups pair. Two things are worth flagging beyond the feature. The split is
decided by the server, and my first version of it was wrong in a way the lint config caught:
computing `Date.now()` during render is impure, so the client no longer decides which section an
event belongs to — the SQL that orders the tab also returns the `upcoming` flag, which removes the
clock from the render entirely and makes the sections and the order incapable of disagreeing. And
the ordering had to go through SQLite's `datetime()`: `startsAt` is RFC3339, so a plain string
comparison against `datetime('now')` would call any event later the same day upcoming. Evidence:
`go build ./...`/`go vet ./...`/`go test ./...` pass (nine packages), `migrations_test.go` now runs
eleven migrations up→down→up with the column assertion and version 11, `npx tsc --noEmit` is clean,
`npm run lint` is back to 0 errors with the same 28 known warnings, and the browser suite passes
with the new Upcoming assertion.

Changed in the group-pagination session (2026-09-28), for review:
`backend/pkg/app/repositories/GroupRepository.go`, `backend/pkg/app/handlers/{GroupHandler.go,GroupContentHandler.go}`,
`backend/cmd/group_pagination_test.go` (new), `frontend/src/app/components/GroupConversation.tsx`,
`frontend/scripts/integration-smoke.mjs`, `TODO.md`.

The first half of the Groups pair: members and join requests no longer arrive whole. The two list
queries now share one constant so the paged endpoint and the unbounded notification fan-out cannot
drift, the sort gained the tiebreaker that paging a tied column needs, and the frontend reuses the
paging primitives the other five lists already use. The browser suite earned its keep twice: it
caught my malformed page query (`&offset=` on a key with no `?`, 404ing every group step) before
this landed, and it now asserts that a short list offers no second page. The events half of the
pair — splitting upcoming from past, and the reminder — is still open with its shape recorded.
Evidence: `go build ./...`/`go vet ./...`/`go test ./...` pass (nine packages ok), `npm run lint`
is 0 errors with the same 28 known warnings, `npx tsc --noEmit` is clean, and the browser suite
passes 27 steps with no runtime exceptions.

Changed in the tree-hygiene session (2026-09-28), for review:
`frontend/src/app/connections/page.tsx`, `frontend/scripts/{integration-smoke.mjs,run-integration.mjs}`,
`frontend/README.md`, `TODO.md`, and the removal of the generated `frontend/.next-smoke/` directory.

Four P2s closed, three of them by measuring rather than by writing code, which is the honest
outcome for housekeeping work: the ignore-pattern item's premise was wrong (every rule is already
explicit, in two tracked `.gitignore` files), the launcher-duplication item has no shared code to
merge (bash and Node, fixed and free ports, long-lived and single-run lifecycles, WSL and
macOS/Windows), and the legacy-route item needed a decision plus the assertion that was missing —
a signed-in visit to `/connections` landing on `/profile`, which nothing checked before. The one
real code change was pointing the test harness's readiness checks at `/api/v1/ready`, which is what
that endpoint was added for, and which also catches a wrong `BACKEND_URL` at startup. Evidence: the
browser suite passes **27 steps** (one new) with no runtime exceptions, run after the deletion;
`npx tsc --noEmit` and `npm run lint` (0 errors, the same 28 known warnings) stay clean without the
directory, since only a tsconfig include that matches nothing and an eslint ignore ever referenced
it. `.next-smoke` was 783 MB, and the claim that the harness recreates it was verified rather than
assumed: after the deletion a cold run rebuilt it from scratch and passed all 27 steps.
`frontend/README.md` now says the first run after a deletion is slower.

Changed in the password-change session (2026-09-28), for review:
`backend/pkg/payload/user/{RegisterRequestDTO.go,ChangePasswordRequestDTO.go}` (the second is new),
`backend/errors.go`, `backend/pkg/app/handlers/{AuthHandler.go,utils.go,handlers_test.go}`,
`backend/pkg/app/repositories/AuthRepository.go`, `backend/pkg/app/service/AuthService.go`,
`backend/pkg/app/service/{SessionManager.go,SessionManager_test.go}`, `backend/cmd/router.go`,
`backend/cmd/{password_change_test.go,health_test.go}`,
`frontend/src/app/api/social.ts`, `frontend/src/app/components/ChangePassword.tsx` (new),
`frontend/src/app/profile/page.tsx`, `frontend/scripts/integration-smoke.mjs`,
`README.md`, `frontend/README.md`, `DEPLOYMENT.md`.

Two Authentication and Security P2s closed. Writing the test found a bug worth naming: the session
cache evicted only the newest token per user, so a token re-cached from the database — what a
restart leaves behind — stayed valid after `SaveSession` had deleted its row. `CreateSession` now
evicts every cached token of that account. Evidence: `go build ./...`, `go vet ./...` and
`go test ./...` all pass; the browser suite passes **26 steps** (two new ones) with no runtime
exceptions, run against the cached Chrome for Testing build; `npm run lint` is 0 errors,
`npx tsc --noEmit` and `npm run build` are clean. One thing is deliberately left undone and
recorded rather than implied: password **reset** needs mail delivery this project does not have, so
it is now its own P2 instead of a closed item. The `gofmt` situation is unchanged —
`SessionManager_test.go` was already on the unformatted list for its import indentation, and the
test added there is tab-indented like the rest of the file.

Changed in the CI-mirror and release-checklist session (2026-09-28), for review:
`.gitlab-ci.yml` (new), `DEPLOYMENT.md`, `README.md`, `TODO.md`.

Two P2s closed, both about the release path rather than the product. The mirror item turned up
something worth knowing: `git remote -v` has a single remote and it is the school's GitLab, so
`.github/workflows/ci.yml` — written and reviewed earlier the same day — never had a host to run
on. `.gitlab-ci.yml` now carries the same four jobs for the host the repository is actually pushed
to. Faithfulness was checked rather than asserted: a script read both files, normalised each job to
`(working-directory, command)` pairs and compared them, and all four match; the two differences
that have no counterpart without the `setup-go`/`setup-node` actions are commented in the file (the
npm cache flag and the explicit `govulncheck` path). The `containers` job is `allow_failure: true`
because Docker-in-Docker needs a runner that permits a privileged service — it is blocking on
GitHub, and it should be flipped once a pipeline shows DinD working. Neither CI file was executed:
this environment has no GitLab runner, and the GitHub one has nothing to run on. `DEPLOYMENT.md`
gained the six-step release checklist the other P2 asked for, and `README.md` now names both CI
files in its layout. Re-verified while mirroring the checks: `npm run lint` (0 errors, the 28 known
warnings) and `npx tsc --noEmit` are clean on this tree.

Changed in the health-endpoint and coverage-gap session (2026-09-28), for review:
`backend/pkg/app/handlers/HealthHandler.go` (new), `backend/pkg/app/handlers/handlers_test.go`,
`backend/cmd/router.go`, `backend/cmd/health_test.go` (new), `backend/cmd/chat_permission_test.go`,
`backend/cmd/group_authorization_test.go` (new), `backend/Dockerfile`, `frontend/Dockerfile`,
`compose.yaml`, `DEPLOYMENT.md`, `README.md`.

Two P2 coverage gaps and one P2 deployment gap closed. Evidence: `go build ./...`, `go vet ./...`
and `go test ./...` all pass; `gofmt -l` reports nothing for any file added or touched here; and
`go test -race ./cmd/ -run 'TestPrivateMessageSocket|TestHealthAndReadiness'` passes. The browser
suite was **not** run: the only frontend change is the image's `HEALTHCHECK`, which that suite does
not exercise, and it is the one part of this session with no evidence behind it — `docker compose
up --build` needs a Docker host. The measurements that corrected the `gofmt` item were taken with
the local `gofmt` from go1.26.5; a different toolchain may list a different set.

Changed in the framework-bump session (2026-09-28), for review:
`frontend/package.json`, `frontend/package-lock.json`,
`frontend/src/app/components/SideBar.tsx`, `.github/workflows/ci.yml`, `DEPLOYMENT.md`.

Next.js moved from the pinned 16.2.12 to **16.3.6**, with `eslint-config-next` in lockstep and
the lockfile refreshed. That took `npm audit` from four high and one critical to **zero**: the
critical named the image-optimisation API, `postcss` and `sharp` went with the framework, and
`js-yaml` and `nanoid` cleared on an in-range `npm audit fix`. The bump is verified by lint
(0 errors), `npx tsc --noEmit`, a production build and the browser suite, which passed 24 steps
against `Next.js 16.3.6 (Turbopack)` — the first framework change in this project with browser
evidence behind it. CI's audit step now enforces `--audit-level=high` instead of reporting, and
the one warning the newer config added (`no-location-assign-relative-destination` at the logout
handler) is answered with a comment explaining why that reload is deliberate rather than by
changing behaviour. The `next/image` item is unblocked but re-scoped: the optimiser fetches
media without the viewer's session cookie, so it cannot serve this app's authenticated images
without `unoptimized` or signed URLs — recorded rather than discovered later.

Changed in the browser-verification and responsive-check session (2026-09-28), for review:
`frontend/scripts/integration-smoke.mjs`, `frontend/src/app/discover/page.tsx`.

The browser suite ran end to end for the first time in this environment — 24 steps pass with
no runtime exceptions — using the Chrome for Testing build already cached on the machine
(`CHROME_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome
for Testing.app/Contents/MacOS/Google Chrome for Testing" npm run test:integration`). That run
is what validates the message-gate assertions, the badge live-region markup and the contrast
changes from the two earlier sessions, none of which had browser evidence until now.

Two things came out of it. The upload step lost its size-ceiling cases: with `Fetch.enable`
intercepting every request, an 11 MB body wedged the harness (a 50 MB one too), while curl
through the same rewrite answered 413 in 0.11s — so the ceilings stay covered by
`cmd/media_upload_test.go`, and the step's comment records why. And the responsive review is
now automated inside the suite, which immediately caught a real overflow: `/discover` at 768px
pushed the page to 807px because a generated handle had no break opportunity, so the card now
truncates the handle and wraps the bio.

Evidence: `npm run test:integration` green (24 PASS, exit 0), `npx tsc --noEmit` clean and
`npm run lint` at 0 errors after the layout fix.

Changed in the backup-drill and repository-test session (2026-09-28), for review:
`scripts/backup-restore-drill.sh`, `DEPLOYMENT.md`,
`backend/pkg/app/repositories/SocialRepository_test.go`,
`backend/pkg/middleware/middleware_test.go`.

The backup → wipe → restore drill the release list asked for is now a script that can be re-run
rather than a claim in a document, and it passed on its first execution: the account, the
session cookie taken *before* the wipe, the post, the photo bytes and the row and file counts
all came back. `DEPLOYMENT.md` records the commands, the result and the Docker-on-a-volume
equivalent, with the caveat that no Docker daemon was available to run that half. The
direct-test item is closed too: `pkg/app/repositories` now exercises the collector's orphan
query across all eight surfaces and the media access rule branch by branch, and `pkg/middleware`
covers `AuthMiddleware` instead of only the limiter.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` pass across all nine packages,
with `pkg/websocket` and `pkg/middleware` also passing under `-race`. The new files are
`gofmt`-clean. The drill is the only end-to-end run in this batch, and it is reproducible with
`bash scripts/backup-restore-drill.sh`.

Changed in the chat-permission, reconnection and direct-test session (2026-09-28), for review:
`frontend/src/app/components/{MessageAction,BackendProvider}.tsx`,
`frontend/src/app/{profile,discover,notifications}/page.tsx`,
`frontend/scripts/integration-smoke.mjs`, `backend/cmd/chat_permission_test.go`,
`backend/pkg/app/handlers/handlers_test.go`, `backend/pkg/websocket/hub_test.go`.

Three P1 items closed and a fourth advanced. **Chat permission**: one `MessageAction`
component gates the Message action on the viewer-relative `canMessage` flag in the profile
header and on every discover card, explaining the rule instead of letting the click earn a
403 — the last piece of the P0-3 handoff. **Reconnect UX**: the provider now surfaces a
dropped socket with a single polite banner, because only the direct conversation had a local
indicator. **States**: the follow-request flow already had its loading, empty and retrying
toast; what it lacked was honesty, so the notifications page no longer renders "No pending
follow requests." or "You're all caught up." after a failed load. **Tests**: `pkg/app/handlers`
and `pkg/websocket` gained direct coverage, and `cmd/chat_permission_test.go` now pins the
discover-list half of the chat rule that the new UI reads.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` pass — both new packages also
under `-race -count=2` — `npm run lint` reports 0 errors, `npx tsc --noEmit` is clean and
`npm run build` succeeds. Still not run: `npm run test:integration`, because this environment
has no Chrome, so the three new browser assertions about the message gate need one smoke run
before they are trusted.

Changed in the media-edge-case, accessibility and release-CI session (2026-09-28), for review:
`backend/errors.go`, `backend/pkg/app/handlers/{utils,MediaHandler,MediaCleanup}.go`,
`backend/pkg/app/repositories/MediaRepository.go`,
`backend/cmd/{main.go,media_upload_test.go,group_management_test.go}`,
`frontend/src/app/lib/useDialogFocus.ts`,
`frontend/src/app/components/{EditProfile,StoriesBar,GroupConversation,FollowListModal,SideBar,PostForm}.tsx`,
`frontend/scripts/integration-smoke.mjs`, `.github/workflows/ci.yml`, `README.md`,
`frontend/README.md`, `DEPLOYMENT.md`.

Three clusters landed together. **Media and upload edge cases**: size violations answer 413
with the limit named, an empty file answers 400 with its own error, the "type comes from the
bytes, never the filename" contract is stated and pinned, and a collector deletes media rows
nothing references (plus their files) at boot and hourly with a 24-hour grace window.
**Accessibility**: one `useDialogFocus` hook now gives `EditProfile`, both `StoriesBar`
dialogs, the `GroupConversation` confirmation and `FollowListModal` the drawer's focus trap,
Escape handling and focus restore; the unread badges moved to a persistent live region; and
four white-on-colour combinations were darkened after measuring them. **Release**: CI with
four jobs, a real top-level README, and the proxy/rewrite contract documented.

Evidence: `go build ./...`, `go vet ./...`, `go test ./...` all pass (including the new
`cmd/media_upload_test.go`), `npm run lint` reports 0 errors, `npx tsc --noEmit` is clean and
`npm run build` succeeds. `npm run test:integration` was **not** run: this environment has no
Chrome, so the browser step added for the upload edge cases and every focus and contrast
change still need one smoke run before they are trusted. `.next-smoke/` and `backend/tmp/`
were left untracked, as before.

Changed in the visibility-audit session (2026-09-28), for review:
`backend/pkg/app/repositories/{PostRepository,ReactionRepository}.go`,
`backend/cmd/post_visibility_test.go`.

Changed in the auth-hardening session (2026-09-28), for review:
`backend/errors.go`, `backend/pkg/app/handlers/{utils,HandlerContext,AuthHandler}.go`,
`backend/pkg/middleware/{limiter.go,limiter_test.go}`, `backend/cmd/{security.go,security_test.go,login_lockout_test.go}`,
`DEPLOYMENT.md`.

Changed in the group-notification session (2026-09-28), for review:
`backend/pkg/models/Notification.go`, `backend/pkg/app/service/{NotificationService,GroupService}.go`,
`backend/pkg/app/repositories/{GroupRepository,GroupContentRepository}.go`,
`backend/pkg/app/handlers/{NotificationHandler,SocialHandler,GroupHandler,GroupContentHandler}.go`,
`backend/cmd/{group_notifications_test.go,integration_test.go}`,
`frontend/src/app/notifications/page.tsx`, `frontend/src/app/components/GroupConversation.tsx`,
`frontend/scripts/integration-smoke.mjs`.

Changed in the P0-5 session (2026-09-28), for review: `backend/pkg/models/Registration.go`,
`backend/pkg/app/repositories/AuthRepository.go`, `backend/pkg/app/service/AuthService.go`,
`backend/pkg/app/handlers/AuthHandler.go`, `backend/pkg/payload/user/RegisterRequestDTO.go`,
`backend/cmd/{seed/main.go,integration_test.go,follow_request_test.go}`,
`backend/cmd/register_fields_test.go`, `frontend/src/app/login/page.tsx`,
`frontend/scripts/integration-smoke.mjs`.

Changed in the P0-4 session (2026-09-28), for review: `backend/pkg/models/Notification.go`,
`backend/pkg/app/repositories/NotificationRepository.go`,
`backend/pkg/app/service/NotificationService.go`,
`backend/pkg/app/handlers/NotificationHandler.go`, `backend/cmd/notification_types_test.go`,
`frontend/src/app/components/SideBar.tsx`, `frontend/src/app/notifications/page.tsx`,
`frontend/scripts/integration-smoke.mjs`.

Changed in the P0-2 session (2026-09-28), for review:
`backend/pkg/db/migrations/sqlite/000010_comment_media.{up,down}.sql`, `backend/pkg/models/{Comment,MediaItem}.go`,
`backend/pkg/payload/comment/CommentDTO.go`, `backend/pkg/app/repositories/{CommentRepository,SocialRepository}.go`,
`backend/pkg/app/service/CommentService.go`, `backend/pkg/app/handlers/{CommentHandler,SocialHandler}.go`,
`backend/cmd/router.go`, `backend/cmd/comment_media_test.go`, `backend/pkg/db/sqlite/migrations_test.go`,
`frontend/src/app/api/social.ts`, `frontend/src/app/components/PostCard.tsx`,
`frontend/src/app/profile/page.tsx`, `frontend/scripts/integration-smoke.mjs`.

Changed in the previous session, for review: `backend/pkg/db/migrations/sqlite/000009_*`,
`backend/pkg/app/repositories/SessionRepository.go`,
`backend/pkg/app/service/SessionManager.go` (+ its test),
`backend/cmd/session_test.go`, `backend/pkg/db/sqlite/migrations_test.go`,
`backend/pkg/models/{Session,Social}.go`, `backend/pkg/app/repositories/{Social,Message}Repository.go`,
`backend/pkg/app/service/{Social,Message,Auth}Service.go`,
`backend/pkg/app/handlers/{ChatMutation,WebSocket,Social}Handler.go`, `backend/cmd/main.go`,
`backend/cmd/chat_permission_test.go`, `frontend/src/app/api/social.ts`,
`frontend/scripts/integration-smoke.mjs`, `frontend/public/assets.ts`, `frontend/.env.example`,
`frontend/.env.local`, `frontend/README.md`, `.gitignore`, `.env.example`, `DEPLOYMENT.md`,
`backend/README.md`.

## Definition of done

A task is complete when: the code builds (`go build ./...`, `npm run build`), tests pass
(`go test ./...`, `npm run test:integration` where relevant), lint and vet are clean,
documentation touched by the change is updated, and this file is ticked with a one-line note
about what changed.
