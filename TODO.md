# Social Network Project TODO

Legend: `[x]` verified working on `main` @ `cb91348` unless an item notes local verification · `[ ]` open · **P0** blocks a mandatory
spec line · **P1** required before release · **P2** polish · **P3** nice to have.

Items closed after that revision carry their own evidence line. The backend ones are locally verified
with `go build ./...`, `go vet ./...` and `go test ./...`; the frontend ones with `npm run lint`
(0 errors), `npx tsc --noEmit` and `npm run build`, and additionally with the browser suite
(`npm run test:integration`), which is runnable here through the cached Chrome for Testing build. The
2026-09-28/30 sessions are **committed and pushed** to `origin/main` as per-file commits, so `git log`
and the session notes at the end of this file are the two records — the notes are newest-first.

Baseline checks: `go test ./...` passes, `go vet ./...` is clean, `docker compose config`
answers client-side with exit 0, and migrations `000001`–`000012` are applied at boot by
`backend/pkg/db/sqlite/sqlite.go`. This list used to claim both images *build* through
`compose.yaml`; that was never measured — the environment that writes this file has no
reachable Docker daemon — so the claim is withdrawn rather than repeated, and the
`up --build` item below stays open for a host that can run it.

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

## Status at submission — 2026-10-04

The mandatory spec is complete: every **P0** item is closed, and the release checks are green
(`go build ./...`, `go vet ./...`, `go test ./...`, `npm run lint` (0 errors), `npx tsc --noEmit`,
`npm run build`, `node scripts/dead-modules.mjs`, the browser suite and `scripts/api-tour.sh`).
**Everything still open below is post-submission work**: the four P2/infra items cannot be built or
verified without a CI runner and a Docker daemon, and the P3 items are optional polish — "which is
worse than having no TODO at all" if the open list were read as unfinished business. Nothing open
blocks the spec.

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
- [x] **P2** Harden uploads further: re-encode images or serve them with
  `Content-Disposition: attachment` and a restrictive CSP so an HTML/SVG payload cannot be
  used for stored XSS. Closed 2026-09-28 by measuring first, and the measurement moved the work:
  two thirds of this item were already done or wrong for this app, and the real hole was somewhere
  the item did not look.
  **Already closed, now pinned by tests:** the type is sniffed from the bytes and must be one of
  six, so an HTML, PDF or SVG payload wearing an image extension is refused `400`, and the served
  response carries the sniffed type with `nosniff` (plus the API-wide CSP). `TestUploadHardening`
  adds the SVG case the item named.
  **Wrong for this app, so not done:** `Content-Disposition: attachment` on media would break the
  product — post photos, avatars, covers, story media and group images are all rendered inline by
  `<img>`/`<video>`. Applying it to defend against a vector the allow-list already closes would
  trade a real feature for nothing. It *is* applied to the one case where it helps, below.
  **The real hole, found by reading the upload path:** the dimension check was skipped for WebP
  ("the standard library has no decoder for it"), so the 40-megapixel ceiling did not exist for
  that format at all — a header-only WebP can declare a canvas of 16384×16384 (the largest VP8L can
  express, since each dimension is 14 bits), which is 268 megapixels from a few dozen bytes. That
  was accepted before this change: reverting the fix makes the new test fail with `got 201`, which
  is how the hole was confirmed rather than assumed. Fixed by registering the WebP decoder
  (`golang.org/x/image/webp`, header-only `DecodeConfig` like the other three) and deleting the
  special case, so one code path caps every allowed image format. The pin is deliberate on the
  dependency: `v0.20.0` keeps the `go` directive at 1.25, where the current release would have
  raised it to 1.26 for a hardening fix.
  **Defence in depth at the other end:** the read path now holds the *stored* type to the same
  allow-list. A row whose type is not one of the six is served as `application/octet-stream` with
  `Content-Disposition: attachment` and `nosniff`, so a row written by an import, a migration or a
  bug cannot be rendered inline; ordinary rows are untouched.
  **Re-encoding, considered and rejected with reasons:** it cannot cover video (mp4/webm need an
  external encoder) or WebP (Go cannot encode it), so it would protect two of six formats; and it
  strips EXIF, which carries the **orientation** tag browsers apply, so phone photos would start
  rendering sideways unless a rotation step came with it. That is a feature with a dependency and
  real work behind it, not a hardening tweak, and it buys little against a vector the allow-list
  already stops. Recorded here rather than left as an implied "not done".
  Verified: `cmd/media_upload_test.go` (four new cases: SVG refused, a maximum-canvas WebP refused,
  a small WebP accepted *and served inline* — which proves the check reads the header instead of
  refusing the format — and a `text/html` row downloaded not rendered), plus `go build`/`vet`/`test ./...`
  pass and the browser suite passes.
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
- [x] **P2** Password reset by email. Split out of the item above on 2026-09-28 so it stays
  visible instead of being implied by the word "reset". The backend has no mailer and no SMTP
  dependency, so this is a feature rather than a variation: choose a provider, add a
  `passwordReset` table holding a hashed single-use token with a short expiry (15-30 minutes),
  send the link, and keep the token single-use and bound to one account. The change flow above
  already does the hard part — verify, rehash, rotate, revoke the account's other sessions — so
  the reset endpoint can reuse it, but it must not ship without rate limiting and without an
  answer that cannot be used to discover which addresses are registered.
  **Closed 2026-09-30, as far as code can go.** The provider is **SMTP through `net/smtp`** —
  standard library, so no new dependency, and not deprecated in this toolchain — behind a `Mailer`
  interface with a log implementation for development and a refusal for production without
  credentials. Migration `000012` adds `passwordReset`, which stores only the **sha256** of a 256-bit
  token: a link is single-use, expires after 30 minutes, and requesting a new one invalidates the old
  one. Single-use is enforced by claiming the row with one
  `UPDATE … WHERE usedAt IS NULL AND expiresAt > ?`, so two confirms racing cannot both change a
  password; a test races four and expects exactly one winner. Redeeming reuses the change flow's hard
  part and goes further than it: the new hash, then `RevokeAllForUser`, which drops the account's
  session rows *and* every cached token — a token cached from the database, which is what a restart
  leaves behind, would otherwise stay usable until its cached expiry.
  Both properties the item insisted on are pinned by tests rather than by prose. The answer is
  identical for a known and an unknown address (same status, same sentence, exactly one token written
  in total), and the limit of three per address per fifteen minutes applies to unknown addresses too,
  because a limit that only covered registered ones would answer the question the endpoint refuses to
  answer. A deployment without a provider answers `503`, so a reset link can never be written to a log
  file in production; a refused delivery deletes the token rather than leaving one nobody holds; and a
  password the register rules refuse costs no token. The frontend has `/forgot` and `/reset` plus a
  link on the sign-in form, and the browser suite reads the link out of the development mailer's log —
  the only way a browser test can hold a token the API never returns — resets a freshly created
  account, signs in with the new password, and asserts that the session which was signed in when the
  reset happened now answers 401.
  Evidence: `go test ./...` across nine packages, plus `-race` on the reset tests; `Mailer_test.go`
  drives the SMTP client against an in-process stub and pins delivery, AUTH when credentials are
  configured, refusal when the server cannot authenticate, and failure when the server is unreachable;
  `npx tsc --noEmit` clean, `npm run lint` 0 errors with the same 19 warnings, `npm run build` passes,
  and the browser suite is green.
  **What is left, deliberately:** no real provider has been used — an in-process stub is not a mail
  service — so the first deployment with credentials is the real test, and the uniform answer is
  uniform in status and body but not in timing. Both are in `DEPLOYMENT.md`.

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
- [x] **P2** Decide whether stories need an audience. They are listed to, and their media is
  readable by, every signed-in user: the audit found no privacy field on the `story` table and
  no audience check in the story branch of `CanViewMedia`. The spec's story requirement does not
  mention privacy, so this is a decision to record rather than a bug to fix silently. **Decided
  2026-09-28: stories stay a broadcast to signed-in members, with no audience.**
  Reasons in the order that decided it: the spec asks for none, and an audience would be scope the
  project has no requirement for; the listing and the media rule already agree with each other, both
  keying on expiry alone, so there is no inconsistency to repair — only a policy to state; and the
  cost is real rather than cosmetic, since an audience means an audience column and a migration, a
  branch in `CanViewMedia`, a decision about what an expired story inside a grace window may still
  do, the UI to choose an audience, and a follow question the spec never asks (followers-only would
  need the same live-relation rule posts use).
  Recorded in three places so it cannot read as an oversight: a comment at the rule itself in
  `SocialRepository.go`, the media-access paragraph in `DEPLOYMENT.md`, and the rules list in
  `README.md` — which had been pointing at this item while it was still open. The behaviour was
  already pinned by tests rather than by prose (`TestExpiredStoryMediaIsCollected` and the
  media-access rule test in `pkg/app/repositories`), so the decision rests on evidence.
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
- [x] **P2** Replace the `dummyUserData` / `dummyMessagesData` fallbacks in
  `frontend/public/assets.ts` with real empty states, then delete the unused exports. Closed
  2026-09-28, and measuring first changed what the work was: the two named fallbacks had **zero
  references** (they were replaced when the live surfaces were built), as did `dummyPostsData`,
  `dummyRecentMessagesData`, `dummyFollowersData` and `dummyFollowingData`. The only fixture still
  referenced was `dummyStoriesData`, and its sole consumers were components nothing imported —
  `StoryCarousel` and `StoryCard`. So the fix was dead-code removal rather than new empty states:
  five unimported components deleted (`StoryCarousel`, `StoryCard`, `StoryItem`, `UserCard` and
  `StoryModal` — one more than the P3 item below had listed), then every dummy export stripped from
  `assets.ts`, which is now just the live `assets` object the login page uses. Deleting the
  components also took five `no-img-element` lint warnings with them (28 → 23). Verified: `npx tsc
  --noEmit` clean, `npm run lint` 0 errors, `npm run build` succeeds, and the browser suite passes
  27 steps — including the stories journeys, which is what proves the deleted pair were not the
  components the app actually renders.
- [x] **P2** Optimistic updates for follow/unfollow and reactions to avoid a full refetch
  on every click. Closed 2026-09-28, with the measurement splitting the item in two.
  **Reactions were already free of refetches** — the post arrows and the comment arrows both keep
  local state and take the server's `totalScore`, so there was nothing to remove. What they were not
  was optimistic: a click did nothing until the round trip answered. Both now flip immediately from
  the delta, replace the estimate with the server's total, and put the previous numbers back with a
  toast on failure.
  **Follow/unfollow did refetch, in two places.** The profile page re-read the posts, the profile and
  the user on every click; discover re-read the whole people list. Both controls now flip at once —
  the intent is held locally and cleared when the refreshed values arrive, with `pendingOutgoing`
  written into the row because a request on a private profile has to keep showing as "Requested" —
  and the *list* refetch is gone. Single-resource reads stay, deliberately: `refreshUser` because
  `user.following` is what every other surface reads, and the profile's own counts because the page
  displays them (the browser suite asserts the count changes, so removing that read would have
  traded a tested behaviour for nothing). Posts are re-read only when following actually changes what
  the viewer may see — following or unfollowing a **private** profile, not the request case, and not
  a public one.
  **The refetch came back through the socket**, which the test caught rather than the reading:
  `/users/{id}/follow` pushes `social_changed` to the target *and* to the actor, and the profile
  page's listener re-read posts and media on it, so an actor's own click still re-read the list it had
  just updated optimistically. The listener now ignores that echo when `actorId` is the signed-in
  user, and still reloads everything on a reconnect, where events really were missed.
  The first version of the test also failed for a reason worth recording: it counted responses across
  *all* open tabs, and the suite keeps the other user's page open, where the reload is correct — the
  count is now per page, which is what makes the claim about *this* click checkable.
  Verified: `frontend/scripts/integration-smoke.mjs` asserts that unfollowing and following from a
  profile change the follower count and issue **no** `/posts?liked=` request on the acting page, and
  the suite passes 27 steps with no runtime exceptions; `npx tsc --noEmit` is clean, `npm run lint`
  is 0 errors, and `npm run build` succeeds.
- [x] **P2** Localise `dateLabel` and relative timestamps. Closed 2026-09-28, measuring first:
  `dateLabel` was **already** locale-aware — it delegates to `toLocaleString()` — so that half was
  recorded rather than rewritten. What did not exist anywhere in live code was a relative label: the
  only relative formatter in the tree was a hand-rolled English plural table inside
  `UserProfileInfo.tsx`, and that file turned out to be dead (see the sweep below).
  Added `relativeLabel` on `Intl.RelativeTimeFormat` with `numeric: 'auto'`, so the wording comes from
  the visitor's locale and a locale that has the word can say "yesterday" instead of "1 day ago". It
  covers the last week and falls back to `dateLabel` beyond that, which is where an exact date tells a
  reader more than "9 days ago" does. Used where recency is the point — notification rows, post
  headers and comment timestamps — each rendered as
  `<time dateTime={isoTimestamp(…)} title={dateLabel(…)}>` so the exact instant stays machine-readable
  and available on hover. Left absolute on purpose, and recorded here so it is a decision rather than
  an oversight: "Joined …", event start times (you need the time of day, not "in 3 days") and chat
  timestamps (a chat wants a clock, not a distance). The parsing both formatters need moved into one
  `parseTimestamp`, which also keeps "Invalid Date" out of the page when a value is not a date.
  The value is computed at render, so it is as fresh as the last refresh — noted in the helper, and
  these surfaces refresh on their own.
  Verified: the browser suite asserts that a freshly written item renders a relative phrase with a
  real `dateTime` and `title`, and — new — that the whole run produces **no console errors**, which is
  also the measurement behind the hydration question this item raises: `toLocaleString()` runs in the
  server render as well as in the browser, and the answer here is that it produces no hydration
  complaints, because every date this app shows comes from data fetched after mount.
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
  it was not attempted blind. Updated 2026-09-30: the job is now **written in both CI files** and
  opt-in — `when: manual` on GitLab, `workflow_dispatch`-only on GitHub — so it cannot redden a pipeline
  while it is stabilised. Two corrections to the plan above came out of writing it: the GitLab job runs
  on `golang:1.26-bookworm` rather than `node:22-bookworm`, because Debian's own `golang-go` is 1.19 and
  under the `go 1.25` directive in `backend/go.mod` while the pinned Go image keeps Go on a digest this
  repository manages, and Node 22 comes from NodeSource instead (the one unpinned download in that file,
  called out in the job comment). The third requirement is now named too: a C compiler, because the
  SQLite driver is CGO. Writing it also surfaced a portability bug nobody had hit — `integration-smoke.mjs`
  fell back to a hardcoded Windows Chrome path, so a Linux runner without `CHROME_PATH` died under an
  "Unhandled 'error' event" ENOENT banner; it now probes the usual locations per platform and fails by
  name. **Still open:** the job has never run on a runner, so its runner half is written and reviewed
  rather than verified, and it should be wired in permanently only once a run is green.
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
  host; record the first-run steps and the expected log lines in `DEPLOYMENT.md`. Half closed
  2026-09-30: `docker compose config` **has now been run** and exits 0 against this file, rendering both
  services, the `service_healthy` gate, the loopback-only port binding and the named volume (a Compose
  v5.1.4 client answers this without a daemon, which is why it was possible here). The other half is
  untouched: `docker compose build` / `up --build` has never run anywhere, because the local engine
  answers HTTP 500 on every API call — Docker Desktop is running but its VM is not serving — so the
  healthchecks and the Dockerfiles remain reviewed rather than executed. `DEPLOYMENT.md` now separates
  the two the same way.
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
- [x] **P2** Guard the build-time `BACKEND_URL` coupling (`DEPLOYMENT.md:5`) with a
  build-time assertion, or move to runtime configuration. Closed 2026-09-28 by taking the assertion
  half, and saying why not the other: the address is compiled into the rewrites, so runtime
  configuration would mean owning a proxy process rather than a rewrite — a different deployment
  shape, not a guard.
  `next.config.ts` now has one `backendURL()`: development still answers with the loopback fallback,
  while a **production build refuses to guess** — unset stops the build with a message naming the fix
  — and the shape is checked too, so a value that is not http(s) or that ends with a slash fails
  instead of compiling `//api/v1/…` into every rewrite. Both CI workflows pass a placeholder, which
  also means CI builds the same shape the image does.
  Verified by failing it and then passing it: with `.env.local` moved aside, the unset build fails
  with exactly that message, `BACKEND_URL='not a url'` fails as malformed, `http://backend:5174/`
  fails on the slash, and the real build passes with `exit=0` once the variable is back.
  `frontend/README.md` no longer claims a silent default and `DEPLOYMENT.md` records the guard.
- [x] **P2** Pin image digests and Go/Node patch versions for reproducible builds. Closed 2026-09-30
  by resolving the conflict the item contains rather than obeying it: the Dockerfiles floated the Go
  patch *because* a current patch clears govulncheck's standard-library findings, so a digest pin
  freezes exactly that. The float is therefore replaced by a pin **plus** `scripts/pin-base-images.mjs`
  (`--check` default, `--write` to refresh), which resolves each tag against Docker Hub, rewrites the
  reference, and reads the toolchain out of the image config — so a pin is not an opaque hash, and a
  drift prints both sides. Eleven references are pinned: both Dockerfiles and `.gitlab-ci.yml`
  (including the image the check itself runs on). The pinned digest is the **multi-arch index**, so one
  pin serves amd64 and arm64. CI's Go/Node specifiers stay floating, on the reasoning that CI is not the
  artifact that ships, and the new `base-images` job in both pipelines reports drift without blocking.
  Verified against the live registry: 9 references unpinned → exit 1; `--write` → exit 0; check re-run
  twice with the tree unchanged; drift forced with the real `golang:1.26.7-bookworm` digest, reported as
  `(golang1.26.8)  was (golang1.26.7)` and exit 1; a bogus tag exit 2 with nothing written. The bug the
  first run exposed is fixed: the pattern compared bare hex against `sha256:<hex>`, so a correct pin read
  as drifted. **Limits, recorded in `DEPLOYMENT.md`:** the check needs Docker Hub (exit 2, and it now
  names a 429 rate limit explicitly rather than reporting it as a failed resolution), and the pins are
  verified to *resolve*, not to build — no daemon in this environment. The limit lifted about an hour
  later and a retry loop that logged every attempt (24 of them) then confirmed **all eleven pins current**
  with `--check` exit 0, `docker:27` and `docker:27-dind` included. The one digest seen mid-session that
  no tag pointed at explained itself once asked the registry: `f649…` is a **single-platform image
  manifest**, not an index — it was the linux/amd64 lookup inside the toolchain read, whose 429 carried
  the same message shape as a tag lookup, so it read as a tag that had drifted. Nothing had drifted, and
  the message now names which lookup failed.
- [x] **P2** Ship a sample reverse-proxy config (Caddy or nginx) showing Host/Origin
  preservation and the WebSocket upgrade for `/ws`. Closed 2026-09-28: `deploy/Caddyfile.example`
  terminates TLS, forwards to the loopback-bound frontend, and shows what the proxy has to do that
  the app cannot do for itself. Caddy rather than nginx because it obtains its own certificates and
  needs no ceremony for the WebSocket upgrade, which is the part easiest to get wrong; the nginx
  equivalents (the usual three `Upgrade`/`Connection` lines plus `proxy_set_header Host $host`) are
  written in the same file for whoever deploys with nginx instead. The document-level headers live
  there on purpose — the backend sends no HSTS and no document CSP, because a JSON API is not where a
  browser reads a policy — and per-client rate limiting is called out as that layer's job, since the
  app's limits are per direct peer.
  **Labelled unverified, deliberately:** this environment has no `caddy` binary and no Docker daemon,
  so the file is reviewed rather than executed. The two things to do on a host are `caddy validate
  --config deploy/Caddyfile.example` and a check that the CSP does not block Next's inline bootstrap
  scripts; the file says both, and `DEPLOYMENT.md` says the same where a deployer will read it.

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
- [x] **P2** Load smoke: 50 concurrent WebSocket clients and sustained request throughput
  through the frontend proxy, confirming the rate limiter behaves. Closed 2026-09-28, split by what
  each harness can honestly carry.
  **In Go** (`cmd/load_smoke_test.go`): fifty signed-in members connected at once, which needed the
  members to be inserted and given sessions through the manager rather than registered — fifty
  bcrypt hashes would prove nothing about the hub, and since this app keeps one session per account
  that is the only way to have fifty signed-in clients simultaneously. One group message, and every
  one of the fifty sockets must receive the broadcast (**50 broadcasts in about 2 ms**). Sustained
  throughput is eight workers against a SQLite-backed endpoint with every response asserted 200 and
  the rate **reported, not asserted** (about 6,700 req/s), because a wall-clock threshold fails in CI
  for reasons that have nothing to do with the code. The limiter gets its own server and its own
  test: requests 1–1200 answered and the 1201st a `429` with `Retry-After`, which pins the `> limit`
  off-by-one the middleware actually implements.
  **Through the proxy** (browser suite): fifty sockets opened from a page against Next's `/ws`
  rewrite, with one socket-sent message that all fifty have to receive. The message goes over a
  socket rather than the REST endpoint because the two push different frames — REST sends
  `message_changed` as a refetch cue, the socket path fans out `incoming_msg` — and the socket path
  is the one being loaded.
  **Deliberately not in the browser:** the throughput burst and the limiter's ceiling. That run
  shares one per-peer budget with every other step, and the first version of this step proved the
  point by tripping it: a 100-request burst pushed the bucket past 1,200, 429'd every following step
  (`/discover` timed out with the tail of the run showing nothing but 429s), and would also have
  failed the console-error guard, since a failed fetch is a console error. The burst was removed and
  the reason recorded rather than papered over — the Go harness has its own bucket and no other
  traffic.
  A second failure in the same step is worth keeping too: the first version opened fifty sockets and
  received **nothing**, because the message was sent while the handshakes were still completing and a
  frame that arrives with no handler attached is dropped by the browser. The handlers are now
  attached at construction, before the handshake finishes.
  Verified: `go test ./...` passes (nine packages) with the three new tests, and the browser suite
  passes 29 steps — including `50 sockets through the frontend proxy, all receiving one fan-out` and
  no console errors.
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
- [x] **P3** Delete the two remaining unimported components: `frontend/src/app/components/StoryItem.tsx`
  and `UserCard.tsx` are referenced by nothing (a grep for either name returns only the files
  themselves) and still build on the older `types/story` shape. They were noticed during the
  accessibility pass because both put white text on a `blue-500` gradient (~3.7:1, below AA);
  deleting them is the right fix rather than recolouring dead code. Closed 2026-09-28 with the
  list corrected: the sweep that closed the dummy-fixture item above found **five** unimported
  components, not two — those two plus `StoryCarousel.tsx`, `StoryCard.tsx` and `StoryModal.tsx` —
  and all five are now gone. `types/story` stays because the live `StoryViewer` inside `StoriesBar`
  still uses it. **Amended 2026-09-28:** a second, systematic pass found six more modules with no
  importer and deleted them too — `MessageItem.tsx`, `ProfileModel.tsx`, `StoryViewer.tsx` (the
  standalone file; `StoriesBar` defines its own, the same trap as `StoryCard`), `UserProfileInfo.tsx`,
  `lib/imageSrc.ts` and, once those were gone, `types/story.ts`. The count only stopped moving when
  the check became a script instead of a guess: `frontend/scripts/dead-modules.mjs` resolves every
  relative import to its target and reports what nothing imports, which is now documented in
  `frontend/README.md` and reports 0 of 53 source files.
- [x] **P3** Run `gofmt` over the files it does not currently accept. Corrected 2026-09-28 after
  measuring instead of trusting this line: `cd backend && gofmt -l .` lists fourteen files, not two.
  Only three have a real formatting problem — `pkg/websocket/types.go` (misaligned struct tags and
  continuation lines), and `pkg/app/service/ReactionService.go` with
  `pkg/app/service/SessionManager_test.go` (space-indented imports). The other eleven, including
  `pkg/app/handlers/ReactionHandler.go`, differ only by a missing final newline, which the previous
  revision described as misaligned tags without opening the diff. Every file added or touched since
  (including `cmd/*_test.go`, `HealthHandler.go` and the new tests) is clean. Left alone a third
  time on purpose: a whitespace-only change across fourteen files would bury the health-endpoint and
  test diff it would land with. It is one command — `cd backend && gofmt -w $(gofmt -l . | grep -v tmp/)` —
  and it belongs in its own commit. Progress 2026-09-30: `pkg/websocket/types.go` is clean now,
  because it was formatted while its event names were extended rather than as a drive-by — so two
  real files remain, and eleven that only need a final newline. **Closed 2026-10-03**: the sweep
  finally has a commit of its own and nothing to bury, so the command above was run over the twelve
  files it named. `gofmt -l . | grep -v tmp/` now answers nothing, and the diff is what this line
  predicted — space-indented imports and statement spacing in `SessionManager_test.go`, and a
  trailing blank line at end-of-file in eleven others. `git diff --ignore-all-space` over the sweep
  showed only those two trailing blank lines, which is the proof that no statement moved rather than
  a promise that it did not; `go build ./...`, `go vet ./...` and `go test ./...` are unchanged and
  green. It still lands as one commit rather than twelve, which is what this entry asked for.
- [x] **P1** Remove the stale Clerk and `NEXT_PUBLIC_DEV_USER` references listed under
  Authentication and Security.
- [x] **P1** Keep this file current. The previous revision marked shipped features (group
  chat, group events, both Docker images) as unchecked while omitting the real gaps, which
  is worse than having no TODO at all. Closed 2026-10-04: the file is current — every closed
  item carries its evidence line, the P0 list is empty, and the status note at the top marks
  everything still open as post-submission work.
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
Ordered roughly by value for effort. **Deferred until after submission** (2026-10-04) — every
item still open in this file is post-submission work; see "Status at submission" at the top.

### Composer and preview

- [x] **P3** Live post preview in `PostForm.tsx`: render the draft exactly as `PostCard` does
  (avatar, handle, timestamp, title, content, image grid, privacy chip), side by side with
  the form on `lg:` and behind a toggle on mobile. Closed 2026-10-02: a new `PostPreview`
  component renders those six elements in `PostCard`'s shell with the theme tokens
  (`bg-card`/`text-text`/`text-muted`/`border-border`/`bg-surface-2`/`bg-card-2`), linkifying
  the draft text and drawing just-picked files from object URLs with the same create/revoke
  lifecycle as `ImagePicker.Preview`. The composer is now `max-w-6xl` with the form and the
  preview side by side on `lg:` (`lg:grid-cols-2`) and the card behind a `lg:hidden` "Preview"
  toggle on mobile. The privacy chip and the composer's `<select>` now share one `PRIVACY_LABEL`
  exported from `api/social.ts`, so the chip, the select and the feed cannot drift. Verified
  with `npx tsc --noEmit`, `npm run lint` (0 errors) and `npm run build`; the browser suite
  needs Chrome, which this environment does not have.
- [ ] **P3** Preview step before publishing, so the author sees the post the way the chosen
  audience will before committing.
- [x] **P3** Audience banner in the preview: "Visible to your followers", or the selected
  names for `privacy === 'selected'`, plus a note when the post will be hidden from a
  private-profile follower. Closed 2026-10-03: the live preview now carries an audience
  banner **above** the card rather than inside it — the article has to stay the draft
  exactly as `PostCard` draws it, and a card has no such banner — worded by one new
  helper, `audienceSummary` in `frontend/src/app/api/social.ts` beside `PRIVACY_LABEL`.
  The helper is written against the server's `postVisibility` clause rather than the
  three labels, because two things there are easy to get wrong: a `public` post reaches
  everyone only while the *author's* profile is public, and nothing about the *viewer's*
  own privacy ever narrows a post. So a public post on a private profile is worded
  "Visible to your followers" with the note that a private profile reaches only those
  who follow it, `followers` is "Visible to your followers", and `selected` names the
  chosen followers (up to two, then "and N others", so a long list stays one line).
  **Corrected rather than obeyed:** the item's note reads "hidden from a private-profile
  follower", but the SQL keys on the *author's* `isPublic` and on whether the viewer
  follows the author — never on the viewer's own profile privacy — so the note belongs to
  the author's profile and is worded that way. **Decision:** the names the banner shows
  are `PostForm`'s already-filtered `audience`, the same set `publish` sends, so a draft
  restored for someone who has since unfollowed cannot be named as reached. It sits in a
  `role="status"` region labelled `Audience`, so a change to the audience is announced.
  Verified: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, and the
  browser suite, whose composer step asserts "Visible to everyone" then "Visible to your
  followers" as the select moves, whose audience-edit step asserts the `selected` banner
  names Alex, and whose private-profile section asserts the narrowing note.
- [x] **P3** Instagram-style modal composer launched from the sidebar and the feed, keeping
  `/create-post` as a deep link (currently the only entry point is
  `Sidebar.tsx:79` → `create-post/page.tsx`). Closed 2026-10-04: `components/ComposerDialog.tsx`
  is a bottom sheet on a phone and a centred card from `sm` up — the shape Instagram uses —
  holding the **same** `PostForm` the deep link renders, so there is one form to keep in step,
  not two. `BackendProvider` owns its state and hands `openComposer()` to the feed's "New post",
  the sidebar's "Create Post" and the bottom bar's Create tab, all of which now open the dialog
  instead of navigating; `/create-post` still renders the form as a page. `PostForm` gained
  `variant="modal"` (it drops the wide two-column chrome and keeps the preview behind its own
  toggle, since a viewport-keyed `lg:` grid cannot know it is inside a narrow dialog) and an
  `onPublished` callback that closes the dialog after the same navigation the page always did.
  The dialog reuses `useDialogFocus` for the keyboard contract and keeps its backdrop a sibling
  of the panel, the same reasoning as the comment sheet. Verified: `npx tsc --noEmit`,
  `npm run lint` (0 errors), `npm run build`, `node scripts/dead-modules.mjs`, and the browser
  suite, whose new step is `PASS: the feed opens the composer as a dialog and closes it on Escape`
  while the existing `/create-post` publish steps are unchanged.
- [x] **P3** Draft autosave to `localStorage` so a refresh does not lose a long post.
  Closed 2026-09-30: `lib/postDraft.ts` owns the key (`social:post-draft`), the composer
  restores it after mount and clears it on publish or Discard. Only the text and the audience
  survive — a `File` cannot be serialised — and the notice on screen says which parts came
  back instead of presenting a half-restored draft as the whole thing. Verified by the browser
  suite, which reloads the document and asserts the text returned while no photo did.
- [x] **P3** Show why publishing is blocked ("Add 4 more characters", "Choose a follower")
  instead of a silently disabled button. Closed 2026-09-30: the reason is computed from the
  draft, rendered beside the sticky publish button, attached to the field with
  `aria-describedby`, and the caret moves to that field when a publish is refused. The form is
  `noValidate`, so the browser's own bubbles cannot pre-empt the sentence, and the server's
  checks are unchanged and remain the authority. Verified in the browser suite.
- [x] **P3** Sticky publish button and keyboard shortcut (Ctrl/Cmd + Enter) to publish.
  Closed 2026-09-30: the existing action row is wrapped in a sticky container rather than
  gaining a second button, and the shortcut is handled on the form's keydown — which is why it
  works from the textarea where the text was typed, and why a bare Enter there is still a
  newline. The browser suite dispatches the key through CDP with that field focused.

### Media and validation

- [x] **P3** Fix the WebP gap: `MediaHandler.go:55` skips `image.DecodeConfig` when the MIME
  is `image/webp`, so WebP dimensions and the 40 MP ceiling are never enforced. Decode with
  `golang.org/x/image/webp`, or re-encode WebP on ingest. Already fixed by the upload-hardening
  session (2026-09-28) and left open there; ticked 2026-09-30 after checking it rather than
  assuming: the `webp` decoder is registered, so `DecodeConfig` reads WebP headers, and
  `cmd/media_upload_test.go` asserts both directions — a 16384×16384 canvas built from a few
  dozen bytes is refused with 400, and a 64×64 WebP is accepted and served as `image/webp`.
- [x] **P3** Enforce minimum dimensions and aspect ratios per purpose: square avatar at least
  200×200, cover at least 800×300, post media between 1:2 and 2:1. Closed 2026-10-04: `ImagePicker`
  gained a `purpose` prop (`image` default, `avatar`, `cover`, `post`) and a `checkPurpose` that
  runs right after the decode, so the refusal names the floor rather than the format. Wired to the
  avatar field on the signup form (`purpose="avatar"`), to post and comment media
  (`purpose="post"` — a ratio, because a feed card crops a very tall or wide picture to a sliver),
  and to `EditProfile`, which **until now uploaded its avatar and cover through raw
  `<input type="file">` fields that skipped every check the picker makes** — the real gap this item
  exposed, now closed by routing both through `ImagePicker` with `purpose="avatar"`/`"cover"`.
  **Corrected rather than obeyed:** the item asks for a *square* avatar, but the rule is a 200×200
  floor. `Avatar` draws under `object-cover`, so any aspect renders correctly, and refusing a
  landscape portrait outright would reject a photo the app shows perfectly; the crop step added
  alongside this item is what an author reaches for when they want the square. The floor is also
  printed in the picker's own hint, so the rule is known before a choice is made. Verified:
  `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, `node scripts/dead-modules.mjs`,
  and the browser suite, whose signup step now first uploads a 1×1 avatar and asserts it is
  **refused with `at least 200×200` named and not added**, then uploads a 256×256 one that is
  stored — the fixture that used to be 1×1.
- [x] **P3** Client-side downscale before upload (canvas, ~1600 px on the long edge, quality
  ~0.85), skipping animated GIFs so they stay animated. This cuts upload time and storage
  for phone photos, which are the common case.
  Closed 2026-10-01. `lib/downscale.ts` re-encodes a photo wider or taller than the cap before it
  is sent, and `api/social.ts` runs every upload through it — so the composer, an avatar, a cover,
  a chat attachment and a group photo all send the capped bytes. The cap is `LARGE_WIDTH`, the
  server's own `large` derivative, rather than a new number: it is the version a viewer actually
  asks for, and `media_limits_test.go` already holds it against `pkg/media`. The encoding mirrors
  that package as well — a JPEG source stays a JPEG at 0.85, everything else becomes a PNG so an
  alpha channel survives, since a transparent avatar put through a JPEG encoder comes out as a
  black box. **Decisions:** a GIF is skipped whole, because a still frame of an animation is a
  different picture — the reason the server writes no derivative of one either; nothing is ever
  enlarged; and every browser failure mode (an undecodable file, a canvas with no context, a null
  blob) returns the original, because a missing optimisation costs a bigger upload while a broken
  one costs a post. The 10 MB ceiling is still checked on the file the reader chose, because
  `ImagePicker` already refuses an oversize selection with that sentence — two gates that agreed
  are better than one quietly reversing the other. Verified: `npm run lint` (0 errors),
  `npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs` (0 of 63), and the browser
  suite, whose fixture is a 2000×1500 PNG written by hand — a signature, an IHDR, a zlib stream of
  scanlines and an IEND, because nothing in the dependencies encodes one — and which asserts the
  file the *server* serves back is 1600×1200.
- [x] **P3** Show each selected file's dimensions and size in `ImagePicker` before upload, so
  a rejection is never a surprise. Closed 2026-09-30: an overlay caption on each tile reports
  `1440 × 1080 · 2.4 MB`, taken from the decode the check already performs (a video's numbers
  arrive from its `loadedmetadata` event). An overlay rather than a line under the preview, so
  the square frame keeps its size and the grid cannot grow a row. Verified in the browser suite
  against the 1×1 fixture, which reads `1 × 1 · 68 B`.
- [ ] **P3** Accept HEIC/HEIF and AVIF on the file input and convert on the client, or reject
  them with a message that names the format.
- [x] **P3** Single source of truth for the limits (10 MB image, 50 MB video, 40 MP,
  4 attachments) shared by `ImagePicker.tsx`, `MediaHandler.go` and the docs, instead of the
  three copies that exist today. Closed 2026-09-30 with the honest shape of it: the three
  browser copies are now one (`lib/mediaLimits.ts`), and `media_limits_test.go` reads that
  module and compares its numbers against the Go constants, failing by name on whichever side
  was changed alone (demonstrated in both directions). Two languages cannot share one literal,
  and this file and the READMEs are a third copy no check can read; both gaps are written down
  in the test and where a deployer reads them, rather than papered over.
- [x] **P3** Return a specific server error ("Image is 12.4 MB, the limit is 10 MB") rather
  than the generic `ErrBadRequest`, and show it verbatim in the toast. Closed 2026-09-30: the
  client names the measured size before it spends the upload, and the server's `413` does too —
  `ErrImageTooLarge` now arrives wrapped in an `ErrDetail`, which is why the status mapping
  moved from `==` to `errors.Is` (a wrapped sentinel that fell through answered `500` for a
  request that was merely too large). The 50 MB gate keeps the limit alone, and the reason is
  recorded at the gate and in `DEPLOYMENT.md`. Verified by injection: reverting that one case
  to equality fails the new test with `500` where `413` is expected, and
  `cmd/media_upload_test.go` asserts both halves of the sentence through the real endpoint.
- [x] **P3** Client-side cropping for avatars, covers and post images (square, 4:5, 16:9).
  Closed 2026-10-04: `lib/crop.ts` draws the crop on a canvas and returns a new `File`, and
  `components/ImageCropper.tsx` is the step — a dialog with the 1:1, 4:5, 16:9 and Original
  presets, previewing exactly the rectangle the canvas keeps by drawing the browser's own
  `object-fit: cover` in a box of the chosen aspect, so there is no second geometry to keep in
  step. Every selected image tile in `ImagePicker` gains a Crop button (not a GIF, whose still
  frame is a different picture, and not a video), and applying re-measures the caption because
  the file's key changed. **Decisions:** a centre crop rather than a draggable window — the
  largest rectangle of that shape that fits, which is what a viewer already sees under
  `object-cover`; nothing is ever enlarged; and the same failure contract as `downscale` (an
  undecodable file, a canvas with no blob, a GIF or the Original preset all return the original),
  because a crop that cannot be done must not cost the upload. It also caps the long edge at the
  server's `large` width for the reason `downscale` does. Verified: `npx tsc --noEmit`,
  `npm run lint` (0 errors), `npm run build`, `node scripts/dead-modules.mjs`, and the browser
  suite, whose new step is `PASS: a photo is cropped to a square in the browser before it is
  uploaded` — a hand-written 600×900 PNG cropped through the dialog and asserted at `600 × 600`
  in the tile caption.
- [x] **P3** Generate derivatives on upload (`_thumb`, `_large`) and serve them with `srcset`
  so the feed stops downloading full-resolution originals. Closed 2026-09-30: `pkg/media` resizes
  each resizable image into a 480 px `_thumb` and a 1600 px `_large` file beside the original, and
  `GET /api/v1/media/{id}?size=thumb|large|original` serves them — answered with the original when
  there is no such file, which is exactly what lets the frontend name both candidates in a `srcset`
  without knowing anything about the upload. Measured end to end rather than asserted: a 3200×2400
  JPEG of 777111 bytes is 192994 bytes as `large` and 46584 as `thumb`, and the browser suite now
  checks that every request for a post's picture carries a `?size=` and that the bare original is
  never fetched. Four decisions are recorded where they are made rather than implied: no derivative
  of a video (nothing here decodes one) or of an animated GIF (a still frame is a different picture,
  not a smaller one), no upscaling at all, and PNG for every non-JPEG source so an alpha channel
  survives — with the cost of that last one written down, since a photographic PNG derivative is
  much larger than a JPEG would be. The two caps are named in `frontend/src/app/lib/mediaLimits.ts`
  and enforced in `pkg/media`, held together by the same drift check as the upload ceilings. The
  collector takes a derivative with its row and recognises a stray one, which is the leak this
  change would otherwise have shipped: a `_thumb` name is not a UUID, so the sweep that predates it
  would have left every derivative behind forever.
- [x] **P3** Lightbox viewer with keyboard navigation and swipe, instead of opening the raw
  file in a new tab (`PostCard.tsx:64` uses `target="_blank"`).
  Closed 2026-10-01. New `components/Lightbox.tsx`: a labelled modal dialog that shows the picture
  at the large derivative (`mediaVariant(url, 'large')` — that function's own comment names a
  lightbox as its caller), moves through the set with the arrow keys, the on-screen arrows and a
  horizontal swipe, wraps around, closes on Escape or a backdrop click, and is a dialog rather
  than a div: it locks the page behind it, traps Tab, takes focus while it is open and hands it
  back to the control that opened it. `PostCard` now draws post photos and comment photos as
  buttons that open it, which removes both `target="_blank"` sites from that file. **Decision:**
  chat (`DirectConversation.tsx`) and group (`GroupActivity.tsx`) images keep their `target="_blank"`
  links for now — the item named `PostCard`, and those two surfaces would each need their own
  browser coverage rather than an untested change. Verified: `npm run lint` (0 errors),
  `npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs` (0 of 60), and the browser
  suite, whose composer now uploads two photos and which asserts the new step by name — the viewer
  opens on the large derivative, takes focus, ArrowRight and ArrowLeft move through the set, and
  Escape closes it and restores focus to the picture it was opened from.

### Instagram-like UI

- [x] **P3** Adopt an Instagram-style shell: slim top app bar with search and the notification
  bell, plus a bottom tab bar on mobile, replacing the off-canvas drawer in `SideBar.tsx`.
  Keep the current sidebar as the `lg:` variant so nothing is lost. Closed 2026-10-04.
  Progress 2026-10-04: **the top app bar is done.** `components/TopBar.tsx` is a slim sticky
  bar — wordmark, a search field that hands its term to `/search?q=…`, the notification bell and
  the Messages entry (each with an unread dot), the theme switch and the avatar — rendered by
  `BackendProvider` above `<main>`. The mobile drawer's opener moved into the bar, keeping its
  `aria-label`, `aria-expanded` and `aria-controls` and still resetting a collapsed sidebar, so
  the drawer's own keyboard contract is unchanged. The two badges are now read **once** in
  `BackendProvider` and shared with the sidebar through `useBackend` instead of being fetched per
  surface — the one-request rule the request-dedup session settled, now that two surfaces show
  them. Verified: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`,
  `node scripts/dead-modules.mjs` (0 of 74), and the browser suite end to end, which still finds
  the sidebar, the drawer open/close/Escape/backdrop steps, both badge assertions and the
  320/375/768/1440 px responsive check. The shell is now complete: the top bar from `sm` up,
  the bottom tab bar below `lg:`, and the sidebar as the `lg:` variant.
  Progress 2026-10-04 (bottom tab bar): the off-canvas mobile drawer is gone.
  `components/BottomNav.tsx` is a fixed bottom bar (`lg:hidden`) of five links — Feed, Search,
  Create, Notifications and Profile — with `aria-current` on the active one and a dot (not a
  number) on Notifications, so a phone never shows two elements claiming the same unread total.
  The sidebar is now `hidden lg:block`: it keeps its `aria-label`, badges and collapse control
  but no longer becomes a drawer, so the `isSideBarOpen` state, its backdrop, its Escape/scroll
  lock and the close button are gone. The top bar drops the drawer opener, shows the favicon
  below `sm` and keeps the search field from `sm` up (search travels with the tab bar on a
  phone). `main` gains `pb-16 lg:pb-0` so nothing hides behind the fixed bar. The browser suite's
  mobile step was rewritten from the drawer's open/close/Escape/backdrop assertions to the tab
  bar's: it now proves the bar is on screen, the sidebar is `display:none` at 390 px, and a tab
  navigates. Verified: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`,
  `node scripts/dead-modules.mjs` (0 of 75) and the full browser suite.
- [x] **P3** Media-first feed cards: full-bleed media that is square by default, with a row of
  icons (heart, comment, share, save) instead of the up/down vote arrows and text buttons in
  `PostCard.tsx:65`. Keep `POST /api/v1/reactions` underneath so no backend change is needed.
  Closed 2026-10-02: post media now bleeds edge-to-edge (`-mx-5` inside an `overflow-hidden`
  card) and renders as filled squares (`aspect-square` + `object-cover` on `bg-card-2`), and the
  action row is four icons — heart (like toggle, `text-danger` when set, keeps the reaction
  score), comment (keeps the count), share and save (`text-brand-1` when set). The post downvote
  arrow is gone from the UI (comment up/down votes are unchanged), and `POST /api/v1/reactions`
  still backs the like. The smoke test's reaction step now clicks `Like post` instead of
  `Upvote post`. Verified with `npx tsc --noEmit`, `npm run lint` (0 errors) and `npm run build`;
  the browser suite needs Chrome, which this environment does not have.
- [x] **P3** Double-tap to like with a heart burst, wired to the existing reaction endpoint,
  with optimistic state instead of the current refetch. Closed 2026-10-02: a double-tap on a
  feed photo likes it (score +1) and plays a scaling, fading heart over the tapped picture.
  The gesture shares the image click handler with the lightbox — the first tap arms it, and a
  second tap inside a 300 ms window cancels it and likes instead — and reuses `react(1)`, whose
  optimistic update was already in place. `handleMediaTap` times taps from the click event's own
  `timeStamp` (not `Date.now()`), so the React Compiler purity rule stays clean; the heart's fill
  and glow follow `--ui-danger` through the `.heart-burst` class in `globals.css`. A double-tap on
  an already-liked photo is a no-op, and a single tap still opens the lightbox after the window.
  Verified with `npx tsc --noEmit`, `npm run lint` (0 errors) and `npm run build`; the browser
  suite needs Chrome, which this environment does not have.
- [x] **P3** Story ring with the brand gradient around avatars in `StoriesBar`, plus a
  seen/unseen state driven by `story` rows. Closed 2026-10-02: every card's author avatar now
  wears a ring — `.story-ring` (the brand gradient, `--ui-brand-1` → `--ui-brand-2`) while the
  story is new to the viewer and `.story-ring-seen` (`--ui-border`) once they have opened it,
  so "new" reads at a glance and both states follow the theme with no second palette. The
  state is carried on `data-story-ring` for the tests, since a gradient has no text to assert
  on. **The seen state is per account, not per browser**, so it is not `localStorage`: migration
  `000016_story_views` adds `storyView(storyId, userId, viewedAt)` with the pair as the primary
  key — a second view is one row — and `ON DELETE CASCADE` on both columns, and `GET /api/v1/stories`
  now answers a viewer-relative `viewed` folded in with a single `LEFT JOIN` on that key (the
  choice `isSaved` already made for a post). `POST /api/v1/stories/{id}/view` records a view,
  idempotently (`ON CONFLICT DO NOTHING`), and 404s a story that is unknown or expired — the
  same answer a read gives — so it cannot confirm that a dead story exists. `StoriesBar` flips
  the ring optimistically through `stories.update` and sends the mark best-effort, falling back
  to a reload so a failed write leaves the server's answer on screen rather than a lie; opening
  a story the viewer auto-advances into marks it the same way. Verified: `go build ./...`,
  `go vet ./...`, `go test ./...` (including the new `cmd/story_view_test.go` — unseen to
  everyone at first, seen for the reader alone, one row after two views, 404 for an unknown *and*
  an expired story, and the cascade on delete — and the migration round trip, whose pinned
  version moved 15 → 16), `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, and the
  browser suite end to end, whose story step now asserts the ring turns when the story opens and
  that the server records the view for that reader.
- [x] **P3** Comment sheet: a bottom drawer on mobile instead of the always-open inline list
  in `PostCard.tsx:41`. Closed 2026-10-02: a post's comments are now inline and open on a wide
  screen, as before, and a **bottom drawer on a phone** — shut until the reader taps the comment
  button, then a `role="dialog"` panel with a grab handle, a title, a close button, a backdrop
  and the same `Comments` inside, so reading, writing and voting are identical either way. The
  keyboard contract is `useDialogFocus` (focus moves in, Tab cycles, Escape closes, the page
  behind freezes) — the same hook the story viewer and the navigation drawer use — and the
  backdrop is a **sibling** of the panel, because `backdrop-filter` makes an element the
  containing block of a `position: fixed` descendant and a wrapping backdrop would anchor the
  sheet to itself. **The decision that shaped this:** which of the two renders depends on the
  viewport, which no class can express for a drawer that must not be in the DOM until it is
  opened, so a new `lib/useMediaQuery.ts` reads `(min-width: 1024px)` in an effect (the way
  `ThemeProvider` reads storage and `SideBar` reads its breakpoint) and returns `false` on the
  first render so hydration cannot mismatch. `showComments` became a tri-state — `null` means
  "follow the viewport", and once the reader has opened or closed the list their own choice
  wins, so a resize never overrules them. Verified: `npx tsc --noEmit`, `npm run lint`
  (0 errors), `npm run build`, `node scripts/dead-modules.mjs` (0 of 69), and the browser suite,
  whose new step is `PASS: on a phone the comments open as a bottom drawer and close on Escape`
  and whose existing `Post comments open by default` assertion still holds on the wide screen.
- [x] **P3** Instagram-style profile header — avatar on the left, posts/followers/following
  stats on the right — and a 3-column square grid replacing `MediaGrid`'s two-column
  `h-48` tiles (`profile/page.tsx:412`). Closed 2026-10-02: the header now puts the avatar on
  the left with the handle, the actions and the counts stacked on its right, and the name, bio
  and join date below the pair; the media tab is `grid-cols-3 gap-1` with `aspect-square`
  `object-cover` tiles in an `overflow-hidden` link (a hover zoom), replacing the two-column
  `h-48` rectangles. **The posts count did not exist**, and a 3-column grid beside a made-up
  number would have been worse than no number, so this is not a purely visual change: a
  **viewer-relative `postCount`** was added to the profile resource — `SocialUser.PostCount`,
  computed in `SocialRepository.SocialProfile` with the **feed's own `postVisibility` fragment**
  (`SELECT COUNT(*) FROM post p WHERE p.userId=? AND <fragment>`), so the number on the header
  equals the posts the page under it can actually show, and a post the viewer may not read is
  not counted for them. **It is deliberately not `posts.items.length`**, which is only the pages
  loaded so far, nor the provider's `/users/me` copy, which is re-read after a follow and so
  would be stale here right after writing a post; the profile resource is the one this page
  already fetches on open. **Decision:** `writeProfile` zeroes the count alongside the name,
  avatar and follower lists when the viewer may not read the profile — masking it rather than
  leaving it to the fragment, because a `selected` grant can keep a post readable to someone who
  may not read the profile at all and a count that still moved would leak that the post exists.
  **Layout note:** the followers/following pair keeps the `aria-label="Profile statistics"` it
  had and the posts count sits in its own `aria-label="Post count"` element beside it, so the
  new number is queryable without changing what the existing checks read from that row. Verified:
  `go build ./...`, `go vet ./...`, `go test ./...` (including the new `cmd/profile_post_count_test.go`
  — zero for a fresh account, the owner's three, a non-follower's two while the profile is
  public, masked to zero when it turns private, restored to three for a follower once it is public
  again, and the count agreeing with the posts list — and the new `query_plan_test.go` case
  `profile post count`, which rides `post_userId_createdAt`), `npx tsc --noEmit`, `npm run lint`
  (0 errors), `npm run build`, `node scripts/dead-modules.mjs` (0 of 69), and the browser suite,
  whose new step is `PASS: the profile header counts posts and the media tab is a three-column
  square grid` and whose existing `Profile statistics` follow/unfollow assertions still pass.
- [x] **P3** Skeleton loaders for the feed and the profile list (`Skeletons.tsx`,
  `PostListSkeleton`, `CardGridSkeleton`, `RowsSkeleton`); `Loading.tsx` is now a small
  centred spinner that honours its `height` instead of stretching to the viewport.
- [x] **P3** Infinite scroll for the feed and the grid: `LoadMore.tsx` observes a sentinel and
  keeps a real button for keyboard and screen-reader users. The remaining work is
  virtualising very long lists (see the performance section).
- [x] **P3** Sticky feed header with a "new posts" pill that appears when posts arrive over
  the socket, instead of a full reload. Closed 2026-10-03: a new server event, `post_changed`,
  is sent from `POST /api/v1/posts` to **every connected account except the author** through a
  new `Hub.BroadcastToAllExcept`, and `components/NewPostsNotice.tsx` raises a sticky pill on
  it whose press calls the feed's existing `refresh` — which *merges* page 1 rather than
  resetting the list, so the pages a reader already scrolled through survive. The frame
  carries **no payload**: an empty notice says only "the feed moved on", so it cannot hand
  every connected account a fact `postVisibility` may withhold (a private profile's post, a
  `selected` one); the author is skipped so their own publish does not immediately offer them
  a reload of the feed their redirect just loaded. It deliberately does not go through
  `useLiveRefresh`, which reloads a surface — the point here is to offer rather than impose,
  so the subscription is `lib/useSocketEvent.ts` (new) and the state is per-feed.
  **Decision on the header:** the pill is `sticky top-0` and the page header above it was left
  as it is; pinning the title row too would drag the stories strip and the suggestion rail up
  the viewport on every scroll, which is not what "sticky" is for here. **Decision on the
  count:** the pill says "New posts" with no number, because the frame has none and the server
  cannot know how many of the nudges a given reader may read. Verified: `go build ./...`,
  `go vet ./...`, `go test ./...` (including the new `TestHubBroadcastExceptSkipsTheNamedUser`
  and `protocol_doc_test.go`, whose README table gained the event), `npx tsc --noEmit`,
  `npm run lint` (0 errors), `npm run build`, and the browser suite, whose new step is
  `PASS: a post created elsewhere raises a "New posts" pill instead of replacing the feed` —
  it publishes as the second account, asserts the author is *not* offered the pill, presses
  dummy's pill and asserts the new post appears while the pill goes.
- [ ] **P3** Move the remaining hardcoded Tailwind values into the `@theme` block in
  `frontend/src/app/globals.css` (radius, shadow, spacing, `--color-ring`) so restyling is a
  one-file change. The `chat-*` component classes there are the model to follow.
- [x] **P3** Dark mode from a `prefers-color-scheme` token set, with the toggle persisted. Closed
  2026-10-03 by checking rather than assuming: the feature shipped in the theme session
  (`b9cdac3`/`07e9cbe`/`656a1bb`) but this line was never ticked. `lib/theme.ts` keeps one
  source for the storage key (`social:theme`), the media query (`prefers-color-scheme: dark`)
  and the pre-paint `themeScript`; `ThemeProvider` resolves `system` against `matchMedia`,
  persists an explicit choice (`system` clears the key so the OS takes over again), and
  `layout.tsx` puts the class on `<html>` before the first paint so there is no flash; the
  switch is `ThemeToggle` in the sidebar, drawn from `dark:` variants. Verified: `npx tsc
  --noEmit`, `npm run lint` (0 errors), `npm run build`, and the browser suite still green.
  No browser assertion was added: the preference is a class on `<html>` and the switch's
  `aria-checked`, which the existing sidebar steps already render.
- [x] **P3** "People you may know" rail on the feed, built from `GET /api/v1/users`.
  Closed 2026-10-01. `components/SuggestedPeople.tsx` reads the same list Discover does and does
  the one thing that endpoint cannot do for itself: it drops everyone the viewer already follows
  or has already asked to follow, and it keeps a small local list of members it has just acted on,
  because `user.following` cannot answer for a *request* — a private profile is not followed until
  it is accepted. The rail renders nothing at all when it has nothing to offer, loading included,
  so the feed never grows a heading with no people under it. Following from it refreshes the
  signed-in user and the member leaves the rail; the browser step follows Alex and then un-follows
  him, so the request flows later in that suite still start from nobody following anybody.
  **Deliberately not a suggestion engine:** the list arrives ordered by handle, which is what the
  item asked for — it names `GET /api/v1/users` — and a friends-of-friends ranking would need a
  query of its own (a count over `follow` joined to the viewer's own follows, ordered by it), so it
  is left as its own task rather than implied by this title. Verified: `npm run lint` (0 errors),
  `npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs` (0 of 67), and the browser
  suite, whose new step is `PASS: the feed offers people you may know, and following one takes them
  out of it`.
- [x] **P3** Empty-state illustrations for the feed, notifications, messages and groups
  instead of plain text. Closed 2026-10-02: `RequestState` now takes an optional `variant`
  (`feed` | `notifications` | `messages` | `groups`) that draws a small lucide icon in a
  tinted circle above the message, plus optional `children` for a call-to-action link, and it
  moved onto the theme tokens (`border-border`/`bg-card`/`text-muted`/`bg-surface-2`). The feed
  (`Inbox`), notifications (`Bell`), messages (`MessageCircle`) and groups (`Users`) empty
  states now use it; the two plain `<p>` list empties in `messages/page.tsx` were converted to
  `RequestState` (the "Start a new conversation" link is kept as a child). Existing `empty=`
  callers render unchanged. Verified with `npx tsc --noEmit`, `npm run lint` (0 errors) and
  `npm run build`; the browser suite needs Chrome, which this environment does not have.

### Product extras

- [x] **P3** Bookmarks / saved posts with a Saved tab (small migration plus a private list).
  Closed 2026-10-01. Migration `000014_saved_posts` adds `savedPost(userId, postId, createdAt)`
  with the pair as the primary key — so a second save is one row, not two — plus a
  `(userId, createdAt DESC)` index for the list. Three routes back it: `POST` and
  `DELETE /api/v1/posts/{postId}/save` and `GET /api/v1/saved-posts`. Both writes are idempotent
  (`ON CONFLICT DO NOTHING`), so the endpoint answers with the resulting state rather than a
  conflict. The list reuses `postVisibility`, so a saved post the viewer can no longer read drops
  out instead of becoming a back door, and saving an unreadable post is a 404 — the same answer a
  read gives, which keeps the endpoint from being a way to probe for posts. Feed and single-post
  responses gained a viewer-relative `isSaved`, filled by one page-wide lookup rather than one
  query per card. **Decision, in place of the item's "Saved tab":** the private list is its own
  `/saved` route behind a shell nav entry, because the profile page is shared with every other
  member's profile and a private list cannot live on it. Frontend: `PostCard` gained the bookmark
  control (optimistic, like the vote arrows), the `/saved` page pages with `usePagedList`, and
  un-saving from that page drops the row. Verified: `go build ./...`, `go vet ./...`,
  `go test ./...` (all packages), `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`
  (emits `/saved`), the new `cmd/saved_post_test.go`, and the full browser suite, which passed with
  the new step `PASS: a post is saved from its card, listed on the private Saved page, and dropped
  when un-saved` and `/saved` added to the anonymous-redirect sweep. **Also fixed while here:**
  `PostRepository.GetPosts` ran its per-post `selectedUsers` lookup while its own `*Rows` was still
  open, which deadlocks whenever the pool holds one connection (the tests set `MaxOpenConns(1)`);
  that lookup now runs after the page's rows are closed, and `SavedPosts` does the same.
- [x] **P3** Hashtags and @mentions: linkify them in posts, comments and chat, plus a hashtag
  results page. Do this after P0-2, since `CommentHandler.go:114` currently rejects
  non-ASCII comments.
  Closed 2026-10-01. `lib/linkify.tsx` scans text for `#tags` and `@handles` and renders links;
  it is a scan rather than a regular expression because the boundary rule is naturally a
  lookbehind, and a lookbehind is a syntax error in browser versions this app still serves —
  where the cost would be a page that does not parse rather than one message rendered plainly.
  It is used in `PostCard` (post bodies and comment text), `DirectConversation` (chat) and
  `GroupActivity` (group posts and comments). A tag opens `/hashtag/[tag]`, backed by
  `GET /api/v1/hashtags/{tag}`; a mention opens `/u/[nickname]`, which resolves through
  `GET /api/v1/handles/{nickname}` and redirects to the profile. **No migration and no tag
  table:** the tag is matched in the text with `GLOB` over a lowercased, space-padded
  `title || content`, which is what expresses "not glued to a word on either side" — so `#travel`
  matches neither `#traveling` nor `abc#travel` — and it means a post written before this is
  findable by its tag immediately, with no backfill. The handler holds the tag to `[a-z0-9_]`,
  which is what keeps it out of GLOB's own syntax. Like the text search it scans, so it joins the
  plan table **with no index**. **Decision:** the handle route cannot live under `/users/` — a
  literal segment there sits at `{userId}`'s depth in `/users/{userId}/media` and its siblings,
  and Go's mux refuses the pair at registration — so it answers at `/api/v1/handles/{nickname}`.
  **Cost recorded:** the tag page indexes posts only, so a tag used solely in a comment or a chat
  message opens an empty page; indexing those is exactly the tag table this design avoids.
  Verified: `go build ./...`, `go vet ./...`, `go test ./...` (including the new
  `cmd/hashtag_test.go`, the plan case and the tour-coverage check both new routes extend),
  `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build` (emits both routes),
  `node scripts/dead-modules.mjs` (0 of 66), and the browser suite.
- [ ] **P3** Reposts and quote posts in the feed.
- [x] **P3** Unified search across posts, groups and users in one results page, with recent
  searches kept locally.
  Closed 2026-10-01. `/search` asks the three surfaces separately rather than through one merged
  query, because each already has its own rule about what the viewer may see: people and groups had
  `?q=` (`DiscoverUsers`, `Groups`), and the post half is new — `GET /api/v1/posts/search?q=&page=&size=`,
  which runs `postFeedSelect` + `postVisibility` with `LIKE ? ESCAPE '\'` on the title and the
  content, so a search is not a second way in. The pattern is escaped in one place now
  (`repositories/like.go`), and the two inline copies in `GroupRepository`/`SocialRepository` were
  folded into it as a pure refactor: three searches that escape differently is how a search for
  `50%` returns the whole table. A blank `q` is a 400, because the empty pattern it would become
  matches every post. The page keeps recent terms in `localStorage` (`lib/recentSearches.ts`,
  re-validated on read like `postDraft.ts`) and offers them as chips. `query_plan_test.go` gained
  the search as a case with **no index**, which is the claim rather than an omission: a leading `%`
  cannot use one, so the query scans and evaluates the fragment per row. Verified: `go build ./...`,
  `go vet ./...`, `go test ./...` (including the new `cmd/search_test.go` and the plan test),
  `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs`
  (0 of 62), and the browser suite, which added `/search` to the anonymous sweep and asserts the
  page by name.
- [ ] **P3** Mute and block a user, enforced in the feed, profile, chat and notifications.
- [ ] **P3** Story replies and a "seen by" list; archive expired stories instead of letting
  the row disappear.
  Progress 2026-10-04: **the "seen by" list is done.** `GET /api/v1/stories/{id}/viewers` answers
  the author's own list, built from the `storyView` table the seen-ring already writes, newest
  view first. It is **author-only by construction**: the query runs only for a story whose owner
  is the caller, an unknown story and someone else's are the same **404** (the choice the comment
  and message reactions make, so the route cannot confirm a story exists), and the owner is left
  out because an author who opened their own story is not a reader of it. The story viewer offers
  a "Seen by N" control to the author alone — fetched only for them, since not asking is the
  cheaper half of the same rule — with a panel naming each viewer. Verified: `go build ./...`,
  `go vet ./...`, `go test ./...` (including `cmd/story_view_test.go`, which now reads the list
  back as the author, refuses it for the reader, and refuses an unknown story's), the API tour
  (route coverage enforced by `cmd/api_tour_test.go`), `npx tsc --noEmit`, `npm run lint`
  (0 errors), `npm run build`, and the browser suite, whose new step is `PASS: a story shows its
  author who has seen it`. **Still open in this item:** story replies, and archiving expired
  stories instead of letting the row disappear.
- [ ] **P3** Chat extras: message reactions, an image lightbox, voice notes, and a shared
  media tab per conversation.
  Progress 2026-10-01: **message reactions are done.** The `reaction` table is already
  polymorphic and `000013` already indexed `(entityType, entityId)`, so this needed a permission
  rather than a new surface: `entityType = "message"` is allowed, and
  `ReactionRepository.reactionTarget` answers with the entity's own read rule — a message names
  the caller as one of its two participants, and anyone else gets a 404 rather than a 403 so the
  endpoint stays useless as an existence oracle. No new route: `POST /api/v1/reactions` already
  existed and is already toured. A message keeps **no** denormalised score column (posts and
  comments have one); the chat list computes the total and the reader's own score with two
  subqueries that ride that index — which is why the reader's `?` sits in the SELECT list and is
  therefore the first bind argument rather than the last. `000015` adds the cleanup that was
  missing: deleting a message takes its reactions with it, the way deleting a comment already
  did. Frontend: a reaction control on each bubble, optimistic like the post arrows, with the
  count visible to both sides of the conversation. Verified: `go build ./...`, `go vet ./...`,
  `go test ./...` (including the new `cmd/message_reaction_test.go` — the permission, the
  viewer-relative score, the toggle, and the trigger asserted against the table itself),
  `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs`
  (0 of 67), and the browser suite. **Still open in this item:** an image lightbox in chat and
  group content, voice notes, and a shared media tab per conversation — the first and third of
  which are done in the paragraph below.

  Progress 2026-10-01 (chat media): **the media tab and the lightbox wiring are done.**
  `GET /api/v1/messages/media?partnerId=&offset=` lists a direct conversation's attachments,
  newest first, in its own small `ConversationMediaItem` rather than a `MessageDTO` — a tile needs
  the attachment and its time and nothing else, which is the choice the profile media tab's
  `MediaItem` already made. It runs the same `CanMessage` rule and the same hidden-for-me rule as
  the thread, so the tab cannot show media from a conversation the reader may not open.
  `DirectConversation` gained a `Chat` / `Media` control, and the tab's tiles open in the app's
  `Lightbox` — as do a bubble's attachment and a group post's photo, the two `target="_blank"`
  sites the lightbox session left behind. **Verified:** `go build ./...`, `go vet ./...`,
  `go test ./...` (every package green, including attachments-only, newest-first, both
  participants, hidden-for-me excluded, an outsider refused, and the tour's new route),
  `npx tsc --noEmit`, `npm run build`, `npm run lint` and `npm run test:integration`.
  The suite's new step, "a conversation lists its attachments, and one opens in the app rather
  than a new tab", runs after the thread steps and **returns the conversation to its Chat tab**
  at the end: the media tab renders no composer, so leaving it selected broke the composer step
  that follows — which is what the step's first run caught.
  Running the suite also surfaced a second, older problem it did not cause. The browser suite is
  one peer (browser to Next proxy to backend) and had grown to about 1,100 requests in the
  busiest minute against the documented 1,200, so the responsive review at the end drew 429s.
  The ceiling is now configurable — `RATE_LIMIT_PER_MINUTE`, defaulting to the tested 1,200 and
  falling back to that default when it is absent, unparseable or not positive, so a zero budget
  can never read as "unlimited" — and `frontend/scripts/run-integration.mjs` raises it, because a
  machine driving a whole suite from one address is not a person. `cmd/load_smoke_test.go` pins
  both the default boundary and the override, and `DEPLOYMENT.md` states the knob and that the
  login/register budget is deliberately not part of it. **Still open in this item:** voice notes.
- [ ] **P3** Activity digest — a weekly summary email or in-app card of followers, comments
  and group activity.
- [ ] **P3** Web push notifications through a service worker for backgrounded tabs.
- [x] **P3** Post analytics for the author: reach per privacy level, reactions over time. Closed
  2026-10-03: `GET /api/v1/posts/{postId}/insights`, author-only, answers in one round trip —
  `reach` (the audience the post's rule actually admits, and which rule that was), the reaction
  total split into up and down, the comment count, and `days`, the reactions grouped by the day
  each row was written. The audience is computed from the post's own row and its author's
  `isPublic` rather than against a viewer, because the question here is "how many people", and it
  mirrors `postVisibility` rather than the privacy label: a `public` post by a private profile is
  reported as `followers`, and `selected` counts the grant. **Decision on the refusals:** read
  access is decided first, so a post the caller may not open answers the same 404 a read gives and
  the route cannot confirm that a post exists; a post they may read but did not write answers 403,
  the answer `UpdatePost` already gives for "not yours". **Decision on the days:** they are grouped
  by the UTC date of `reaction.createdAt`, and the table keeps one row per account per post (its
  unique key), so the series shows when a reaction was last written rather than counting a changed
  vote twice — recorded because "reactions over time" can be read either way. Frontend:
  `components/PostInsights.tsx` on the post page, rendered *and* requested only for the author
  (`useResource(path, isAuthor)`), because asking on anyone else's behalf would be a request whose
  answer is already known to be a 403. Verified: `go build ./...`, `go vet ./...`, `go test ./...`
  (including the new `cmd/post_insights_test.go` — zeroes for a fresh post, the audience flipping
  everyone → followers → selected → followers as the privacy and the profile change, a changed vote
  replacing rather than adding, two backdated rows grouping into two days, the comment count, the
  403 and the 404 — and the tour-coverage test, which the new route satisfies through a new `# route:`
  line in `scripts/api-tour.sh`), `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`,
  and the browser suite, whose new step is `PASS: a post's insights belong to its author alone`.

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
- [x] **P3** Stop the feed preloading every post's comments, and make posting one fast.
  Closed 2026-10-04: on a wide screen `PostCard` renders a post's comments open, so every
  card in a ten-post page fired its own `GET /posts/comments` on mount — ten requests
  before the reader had looked at one. The read is now gated by `lib/useInView.ts`, a new
  `IntersectionObserver` hook: the section stays mounted, so its form and its place in the
  layout do not move, but its first page is asked for only as it comes near the viewport
  (`300px` ahead of it). That keeps the "open by default" behaviour and the browser suite's
  `Post comments open by default` assertion intact. Submitting is cheaper too: the row the
  server returns is spliced in at the top instead of re-reading page one — a second round
  trip that also discarded the pages already scrolled through — and a comment's photos
  upload together in the picker's order rather than one after another. A submit that lands
  before the section has been seen (a programmatic fill) still works, because it switches the
  read on and page one then carries the new comment. Verified: `npx tsc --noEmit`,
  `npm run lint` (0 errors), `npm run build`, `node scripts/dead-modules.mjs` (0 of 73).
- [ ] **P3** Virtualise long comment and chat lists, which currently render every loaded item.
- [x] **P3** Deduplicate requests. Closed 2026-10-04: the item's own targets were stale —
  `/users/me` is fetched once per session by `BackendProvider` and handed to every consumer
  through `useBackend`, and `/users/me/follows` is a single call in `PostForm`. The real
  remaining duplicate was the sidebar, which asked the same endpoint twice for the two halves
  of one answer (`/notifications/unread-count?exclude=message` and `?types=message`), each
  with its own 15-second poll *and* its own socket listeners — two requests on the hottest
  path, since the badges refresh on every socket event and every poll. A new
  `GET /api/v1/notifications/unread-counts` answers both in one pass (a
  `COALESCE(SUM(CASE WHEN entityType = 'message' …))` split, so both subtotals come from one
  query), and `SideBar` now sends one `useResource` + one `useLiveRefresh`. The old filtered
  endpoint is kept and still toured, so nothing else regresses. The pair is asserted against
  each filtered half at three points in `cmd/notification_types_test.go` — which is what caught
  the two `SUM` columns being scanned in the opposite order. Verified: `gofmt -l pkg cmd`
  (clean), `go build ./...`, `go vet ./...`, `go test ./...`, `npx tsc --noEmit`, `npm run lint`
  (0 errors), `npm run build`, `node scripts/dead-modules.mjs` (0 of 73), the browser suite
  (green end to end, including `an unread chat moves the messages badge and not the bell`), and
  `scripts/api-tour.sh` (101 requests, each with the status it should have). **Found while
  verifying, and fixed:** the tour had been posting the register nickname as `nickname=`, while
  `RegisterRequestDTO` reads `nickName=` — the casing the frontend's own `<input name="nickName">`
  uses — so registration generated a handle instead and the tour's `/handles/tourb…` step 404'd
  before it ever reached this endpoint; a one-word fix (three form lines in `scripts/api-tour.sh`)
  unblocked the whole tour on `main`.
- [ ] **P3** Add a Lighthouse / Core Web Vitals budget and enforce it in CI.
- [x] **P3** Add bundle-size reporting to the frontend build. Closed 2026-10-03:
  `frontend/scripts/bundle-size.mjs`, run at the end of `npm run build` and again by
  `npm run size`. It reads the `<route>_client-reference-manifest.js` files Next writes into
  `.next/server/app` rather than analysing the bundles, so it needs no extra dependency — the
  frontend still has none for this — and it reports the chunks the browser is actually told to
  fetch, per route and in total, with the shared framework kept as its own line because it is not
  any one route's to trim. A chunk shared by several routes is counted once per route that loads
  it, and the largest chunks are listed by the routes that pull them, which is where a size
  problem is actionable. The first report on this tree reads: 25 routes, 3 213.0 kB of route
  JavaScript summed, 1 514.3 kB of CSS, and 538.6 kB of framework in 6 chunks every route
  loads. **Decision:** it is a report, not a gate — the budget item below is the one that would
  fail a build. Verified by running it against a real build (`npm run build` prints it) and the
  rest of the suite unchanged: `npx tsc --noEmit`, `npm run lint` (0 errors), `go test ./...`.
- [x] **P3** Add indexes for the queries introduced by the follow-request and comment-media
  work, and review the feed query with `EXPLAIN QUERY PLAN`. Progress 2026-09-28: 000010 adds
  `comment_userId` for the profile media query; the follow-request side and the feed review
  are still open. Closed 2026-09-30 by migration `000013_query_indexes`, after measuring
  rather than reading: the incoming follow requests scanned 800 rows and sorted them
  (~22 µs) and are now a covering search with no sort (~9 µs), and the feed's page read
  every post in the database, evaluated the visibility rule per row and sorted the result
  (~800 µs at 3 000 posts) where it now walks the index and stops when the page is full
  (~36 µs). The same review found four more paths scanning and indexed them too — the
  author's own posts, one post's comments, the unread badge the sidebar polls every fifteen
  seconds (~90 µs → ~7 µs) and one entity's score (~190 µs → ~6 µs) — and rejected two
  candidates with reasons: `post(privacy, …)`, which the planner never picks because the
  visibility predicate is not a simple equality, and `notification(userId, createdAt)`,
  which measured indistinguishable from the index taken. `query_plan_test.go` asserts the
  plan each one is responsible for, drops the index to show what the query costs without it,
  and restores it; the exact plans and numbers are quoted in the migration and in the session
  note below.
- [x] **P3** Add a component gallery (Storybook or a `/dev/components` route) so the
  Instagram-style redesign can be reviewed without clicking through whole flows. Closed
  2026-10-04: `frontend/src/app/dev/components/page.tsx` is the route — the post card
  (`PostPreview`, with its audience banner), the avatars at the sizes the app uses, the two unread
  badges, `Loading`, the three skeletons, the four empty states and the theme switch, each in a
  titled section. **Decisions:** the route rather than Storybook, because the frontend has no
  dependency for a gallery and the item allowed either; every piece shown is presentational and
  takes props, so the page fetches nothing and is honest about what each looks like without a
  session behind it — the one interactive control is the theme switch, wired to the same provider
  the app uses; and it is a **development** tool rather than a feature, so a production build calls
  `notFound()`, which a build-time `NODE_ENV` decides once and the deployed bundle carries as a
  404. Verified: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`,
  `node scripts/dead-modules.mjs`, and the browser suite, whose new step navigates the signed-in
  browser to `/dev/components` and asserts the gallery and the preview's audience banner render:
  `PASS: the dev-only component gallery renders the redesigned pieces in isolation`.

### Developer experience

- [ ] **P3** Extend `backend/cmd/seed/main.go` with realistic demo data — users, follows,
  posts with media, groups, conversations — and document a single `make seed` command. Half done
  2026-09-30: `make seed` exists (and `make seed-demo` for the second account), documented in
  `README.md` and `make help`. The command itself still creates accounts only — one, or two with
  `-demo` — and no content. That is deliberate for now: the API tour builds the follows, posts,
  media, groups and conversations it needs through the API, so a rich fixture would be a second
  source of demo data to keep in step. The item stays open for whoever wants the seeded version.
- [x] **P3** Generate an OpenAPI document or an HTTP collection from `backend/cmd/router.go`
  so the API can be exercised without the UI. Closed 2026-09-30 as `scripts/api-tour.sh`, the
  second of the item's two options and the one that can be checked here: 88 requests covering all
  66 patterns in `router.go`, from registration to deleting the group it created, each asserting
  the status it should get. `backend/cmd/api_tour_test.go` parses both files and fails by name if
  a route is added, renamed or removed without the tour following. OpenAPI was rejected rather
  than deferred: schemas cannot be validated in this environment, and a document nobody can check
  drifts silently, while a tour is verified by being run. Running it corrected four assumptions —
  register and login are form-encoded where the rest of the API is JSON, a wrong password is a 400
  and not a 401, a socket upgrade without an `Origin` is a 403, and deleting a post cascades to
  its comments.
- [ ] **P3** Add per-branch preview deployments. Left open and untouched 2026-09-30: it needs a
  CI runner and somewhere to deploy to, so nothing about it can be built or verified here. It is
  the one Developer experience item that is not a local tool.
- [x] **P3** Add a `make` (or `just`) file wrapping the commands already spread across
  `run.sh`, `DEPLOYMENT.md` and this file. Closed 2026-09-30 as a `Makefile`, because make is on
  every machine this project runs on (GNU make 3.81 here) and `just` is not installed anywhere it
  has been run. Every target is one line calling something that already existed — `dev`, `status`,
  `seed`, `seed-demo`, `build`, `lint`, `types`, `test`, `test-race`, `smoke`, `check`, `pin-check`,
  `compose-config`, `api-tour` — and each was run for this commit except `dev`, which the ports
  were already holding (see the note in the session log below). There is no `stop` target on
  purpose: `./run.sh` implements those verbs only through its WSL launcher, so a `stop` here would
  have started a second copy of the stack.
- [x] **P3** Document the WebSocket message protocol (`backend/pkg/websocket/types.go`) in
  `backend/README.md`: event names, payload shapes and direction of travel. Closed 2026-09-30 with
  the five event names the backend still sent as string literals lifted into `types.go` first, so
  the protocol is one list rather than a list plus a grep: fifteen event constants in all, six of
  them client-to-server, eleven server-to-client (typing and typing_stopped travel both ways), plus
  the client-only `connected`. `pkg/websocket/protocol_doc_test.go`
  fails by name when a `MsgType` constant or a `*Payload` struct is not in the document, and the
  other way when the document names something nothing sends. Writing it down found that
  `send_error` is declared and never produced (so a refused `private_msg` tells its sender
  nothing), that the `notification` event carries two different payload shapes depending on
  whether it came from the socket or a REST handler, and that the write pump batches frames with
  newlines, which a client has to split on.

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
Changed in the chat-media session (2026-10-01), for review:
`backend/pkg/payload/message/ConversationMediaDTO.go` (new),
`backend/pkg/app/repositories/MessageRepository.go`, `backend/pkg/app/service/MessageService.go`,
`backend/pkg/app/handlers/MessageHandler.go`, `backend/cmd/router.go`,
`backend/cmd/conversation_media_test.go` (new), `scripts/api-tour.sh`,
`frontend/src/app/api/social.ts`, `frontend/src/app/components/DirectConversation.tsx`,
`frontend/src/app/components/GroupActivity.tsx`, `frontend/scripts/integration-smoke.mjs`,
`backend/cmd/security.go`, `backend/cmd/main.go`, `backend/pkg/config/AppConfig.go`,
`backend/cmd/load_smoke_test.go`, `frontend/scripts/run-integration.mjs`, `DEPLOYMENT.md`,
`README.md`, `backend/README.md`, `TODO.md`.

The second half of "Chat extras", and the two `target="_blank"` sites the lightbox session left
behind. A direct conversation now has a Media tab, and every attachment in the chat — on a bubble,
in the tab, and on a group post — opens in the app's own viewer.

The endpoint is deliberately a narrow one. It reads the same thread `GetMessages` reads, with the
same `CanMessage` rule and the same rule about rows hidden for this viewer, and narrows it to the
rows that carry an attachment; that means the tab cannot become a way to see media from a
conversation the reader may not open. It answers with its own small type rather than a
`MessageDTO`, because a tile needs the attachment and its time and nothing more — the same choice
the profile media tab made with `MediaItem`, and the reason the reaction totals added last session
do not leak into a view that has no control to draw them with.

This session ran what the previous one could not, and both gaps it recorded are now closed — with
one of them paying for itself. `npm run lint` is clean and the browser suite went green end to end,
but the suite's **first** run of the new step failed for a reason worth keeping: the step left the
conversation on the Media tab, and the media tab renders no composer, so the composer step that
follows had nothing to type into. The step now returns to the Chat tab before it finishes, which is
a fix to the step rather than to the feature.

The second failure was not this session's to cause, and it is the more interesting one. With the
new step in place the suite failed deterministically in the responsive review at the end — 429s,
not a broken assertion. The ceiling is real and documented (1,200 non-auth requests a minute per
direct peer, pinned by `cmd/load_smoke_test.go`), but it is per *peer*, and the whole browser suite
arrives as one: the browser talks to Next, Next proxies to the backend, so every step shares a
single bucket. By this run the suite's busiest minute was about 1,100 of those 1,200, which is why
the step after it — twelve extra requests was enough — tipped it over, and why the earlier
`integration-1790871395305` run peaked at 685 and never noticed. Raising the tested 1,200 to make a
test pass would have been the wrong repair: that number is a security control with a test on its
boundary. So the ceiling became configurable instead. `RATE_LIMIT_PER_MINUTE` moves it per instance,
defaults to 1,200, and falls back to that default when it is absent, unparseable or not positive —
a zero budget must never read as "unlimited" — and `run-integration.mjs` sets it to 6,000, because a
machine driving a full suite from one address is not the traffic the limit is aimed at. The login
and register budget, and the per-account lockout, are deliberately not configurable. Both halves are
pinned: the twelve-hundredth-answers-twelve-hundred-and-first-is-refused test still runs on the
default, and a new `TestConfiguredRateLimitMovesTheBoundary` proves a configured value actually
moves the middleware's boundary rather than being read and ignored.

The rest of the suite is verified rather than reviewed this time. `go test ./...` is green across
every package, including the new `cmd/conversation_media_test.go` — the filter, the order, both
participants, hidden-for-me, an outsider's 403 and the missing partner's 400 — plus the
tour-coverage check the new route extends, `npx tsc --noEmit`, `npm run build`, `npm run lint`, and
`npm run test:integration` through to the end.

Changed in the message-reaction session (2026-10-01), for review:
`backend/pkg/app/repositories/ReactionRepository.go`,
`backend/pkg/app/repositories/MessageRepository.go`,
`backend/pkg/app/service/ReactionService.go`, `backend/pkg/app/service/MessageService.go`,
`backend/pkg/models/Message.go`, `backend/pkg/payload/message/MessageDTO.go`,
`backend/pkg/db/migrations/sqlite/000015_message_reaction_cleanup.{up,down}.sql` (new),
`backend/pkg/db/sqlite/migrations_test.go`, `backend/cmd/message_reaction_test.go` (new),
`scripts/api-tour.sh`, `frontend/src/app/api/social.ts`,
`frontend/src/app/components/DirectConversation.tsx`, `frontend/scripts/integration-smoke.mjs`,
`README.md`, `backend/README.md`, `TODO.md`.

One item advanced rather than closed: "Chat extras" lists reactions, an image lightbox, voice
notes and a shared media tab, and this is the first of the four.

What made it small is that the machinery was already general. `reaction` is keyed by
`(userId, entityType, entityId)` and `000013` already indexed `(entityType, entityId)` for the
score lookups, and `POST /api/v1/reactions` is already the endpoint the feed uses — so the change
is a *permission* rather than a surface: a message is readable by exactly its two participants,
and anyone else is answered not found, which is the same answer an unreadable post gives and the
reason the endpoint cannot be used to learn that a message exists.

Two details are worth the words because both would otherwise look like mistakes. A message keeps
**no denormalised score column** the way posts and comments do — the chat list computes the total
and the reader's own score with two subqueries over that index. The reader's bind parameter
therefore sits in the SELECT list, which means it is the *first* argument to `Query` and not the
last; that ordering is now written above the query, because it is exactly the kind of thing a
later edit gets wrong silently. And the cleanup is a **trigger**, not a foreign key, because
`reaction.entityId` is shared by three kinds of row and so cannot reference one table: `000002`
gave comments and messages their cleanup triggers and left reactions-on-a-message out only because
nothing could react to one yet. `000015` closes that gap, and the test asserts it against the
table itself, since an orphaned reaction is invisible through the API.

One drive-by, precedented rather than incidental: `ReactionService.go` came out of this change
formatted (its imports were unordered and it had no final newline). It was on the `gofmt` item's
list of files with a real problem, and formatting a file you are already changing is what that
list asks for — the same thing happened to `pkg/websocket/types.go` when its event names were
extended — so the list is now down to one real file.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` — including the new
`cmd/message_reaction_test.go` (the permission from both sides and from an outsider, the
viewer-relative score, the toggle, and the trigger against the table) and the migration round
trip, whose pinned version moved 14 → 15 — then `npm run lint` (0 errors), `npx tsc --noEmit`,
`npm run build`, `node scripts/dead-modules.mjs` (0 of 67), and the browser suite, whose new step
is "a chat message can be reacted to and un-reacted, and the total belongs to the message".

Changed in the suggestion-rail session (2026-10-01), for review:
`frontend/src/app/components/SuggestedPeople.tsx` (new), `frontend/src/app/page.tsx`,
`frontend/scripts/integration-smoke.mjs`, `README.md`, `TODO.md`.

One P3 closed, frontend-only, the smallest surface of this run of sessions. The feed now carries a
rail of members the viewer does not follow yet, with a button that follows them — or asks to, for a
private profile — and takes them out of the rail.

The filtering is the whole feature, and it is the part `/users` cannot do for itself. That endpoint
already leaves the signed-in user out, but it cannot know that the viewer follows someone, has
asked to, or has just acted on a row in this rail. So the component drops the first two using the
viewer's own list, and remembers the third locally — because `user.following` is not updated by a
*request* until the target accepts it, and the failure mode there is a card that refuses to go
away. The distinction is written where the state lives.

What it deliberately is not is a suggestion engine. A friends-of-friends score is a real feature —
one query, a count over `follow` joined to the viewer's own follows, ordered by it — and the item
named `GET /api/v1/users`, so this is a rail over that list rather than a ranking pretending to be
one. The difference is recorded in `TODO.md` so the title does not over-promise.

Two smaller decisions. The rail renders nothing at all when it has nothing to offer, loading
included: a heading with no people under it is worse than no heading, and it is what every visit
would otherwise open with. And the browser step un-follows at the end of itself, because this
suite's follow-request flows later assume nobody follows anybody — checking a rail is not worth
changing what those assertions mean.

Evidence: `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, and
`node scripts/dead-modules.mjs` (0 of 67). The browser suite passed end to end with the new step by
name: "the feed offers people you may know, and following one takes them out of it". No backend
change, so no Go test or tour line was needed for this one.

Changed in the hashtags session (2026-10-01), for review:
`backend/pkg/app/repositories/PostRepository.go`,
`backend/pkg/app/repositories/SocialRepository.go`, `backend/pkg/app/repositories/SavedPostRepository.go`,
`backend/pkg/app/service/PostService.go`, `backend/pkg/app/handlers/PostHandler.go`,
`backend/pkg/app/handlers/SocialHandler.go`, `backend/pkg/app/repositories/query_plan_test.go`,
`backend/cmd/router.go`, `backend/cmd/hashtag_test.go` (new), `scripts/api-tour.sh`,
`frontend/src/app/lib/linkify.tsx` (new),
`frontend/src/app/components/{PostCard,DirectConversation,GroupActivity}.tsx`,
`frontend/src/app/hashtag/[tag]/page.tsx` (new), `frontend/src/app/u/[nickname]/page.tsx` (new),
`frontend/scripts/integration-smoke.mjs`, `README.md`, `backend/README.md`, `TODO.md`.

One P3 closed. `#tags` and `@handles` are now links wherever the app prints text — post bodies,
comment text, chat and group posts — and each link lands somewhere real: the tag on its own results
page, the mention on the member it names.

The design decision worth the words is the one this *doesn't* add. A hashtag is usually a table and
a write path (extract on create, re-extract on edit, index the tag), and the alternative here is to
match the tag in the text with `GLOB`. `GLOB` is what makes the boundary rule expressible at all —
`LIKE` has no character classes, so "not glued to a word on either side" cannot be written with it —
and matching the text means there is no write path, no migration, and no backfill: a post written
before this session is findable by its tag the moment it boots. The cost is honest and is written
down: it scans, exactly as the text search does, so it joins the plan table with **no index** rather
than claiming one.

Two things the tests found rather than the design. The leading space in
`lower(' ' || title || ' ' || content || ' ')` is load-bearing: without it a title that *begins*
with a tag has no character before the `#` for the pattern to match, and the post is silently
missing from its own page — which is what the title fixture caught. And the handle route could not
live under `/users/` at all: a literal segment there sits at `{userId}`'s depth in
`/users/{userId}/media` and its siblings, and Go's mux refuses that pair at registration, which
showed up as a panic the first time a test built the router. It answers at `/api/v1/handles/{nickname}`
instead, with the reason in the router beside it.

The frontend half is deliberately a scanner and not a regular expression. The boundary rule is a
lookbehind, and a lookbehind is a syntax error in browser versions this app still has to serve —
where the failure mode is not one message rendering plainly, it is a page that does not parse. The
scan also skips a symbol preceded by a slash, so a URL fragment like `site/#top` stays an address
rather than becoming a tag, and it never links inside a word, so `someone@host` and `word#tag` are
left alone.

The third caller also paid for a cleanup: the feed, the search and the hashtag page return the same
eleven-column projection, so their three copies of the scan loop (and of the single-connection
comment above it) are now one `scanPostPage`. A column added to `postFeedSelect` no longer has to be
added in three places to keep working.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` — the new `cmd/hashtag_test.go`
(boundaries, case, visibility, an unknown tag, and a tag that is not a tag), the nickname lookup
including the masking it shares with `/users/{userId}`, the plan case and the tour-coverage check
both new routes extend — then `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, which
emits `/hashtag/[tag]` and `/u/[nickname]`, `node scripts/dead-modules.mjs` (0 of 66), and the
browser suite, whose new step publishes a tagged post, follows the tag to its page, and follows the
mention to the profile. 37 steps, exit 0.

Changed in the downscale session (2026-10-01), for review:
`frontend/src/app/lib/downscale.ts` (new), `frontend/src/app/api/social.ts`,
`frontend/scripts/integration-smoke.mjs`, `README.md`, `frontend/README.md`, `TODO.md`.

One P3 closed, and the first change in this run with no backend half at all. A photo wider than the
1600 px cap is now re-encoded in the browser before it leaves, so the bytes that travel and the
bytes that are kept are the ones a viewer will ask for. It needed no new number, which is most of
why it was cheap to add: the cap is `LARGE_WIDTH`, already exported for `srcset` and
already held to `pkg/media` by `media_limits_test.go`, so nothing new has to be kept in step with
the server.

Two rules are borrowed rather than invented, both from `pkg/media`. A JPEG source stays a JPEG, at
0.85; everything else becomes a PNG so an alpha channel survives — a transparent avatar run through
a JPEG encoder is a black box with a border, which is exactly the failure the backend's rule was
written to avoid. And a GIF is skipped whole: a still frame of an animation is a different picture,
not a smaller one, which is the same reason the server writes no derivative of one. Where the two
differ is deliberate: the server has a decoder it trusts, while the browser here is allowed to fail.
An undecodable file, a canvas with no 2-D context and a null blob each return the original, because
a missing optimisation costs a slightly bigger upload and a broken one costs the post — and an
upload path that can be broken by its own optimisation is worse than an upload path with none.

The size ceiling stays where it was, on the file the reader chose rather than on the shrink. It
would be easy to reverse that and let a 12 MB photo through because it would have fitted, but
`ImagePicker` already refuses that file with its own sentence, and two gates that disagree about
what is allowed is how a limit stops being one. The decision is written next to the check.

Verified in the only place this can be: the browser. The fixture is a 2000×1500 PNG, and it had to
be constructed — the dependencies here have no encoder and every other fixture is 1x1 — so the suite
writes one by hand (signature, IHDR, a zlib stream of raw scanlines, IEND, each chunk with its CRC)
and then asserts what the *server* serves back is 1600×1200, which is a check of the upload rather
than of the intended arithmetic. `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build` and
`node scripts/dead-modules.mjs` (0 of 63) are clean, and the suite passed 36 steps.

One caveat recorded rather than re-run away: the first run of the suite after this change failed in
the follow-request step ("cancel removes incoming request"), which never touches the upload path, and
passed unchanged on the next run; the failure was in a socket-driven assertion on dummy's page, so it
is noted here as a flake rather than presented as a clean sweep.

Changed in the unified-search session (2026-10-01), for review:
`backend/pkg/app/repositories/like.go` (new),
`backend/pkg/app/repositories/{PostRepository,GroupRepository,SocialRepository}.go`,
`backend/pkg/app/service/PostService.go`, `backend/pkg/app/handlers/PostHandler.go`,
`backend/pkg/app/repositories/query_plan_test.go`, `backend/cmd/router.go`,
`backend/cmd/search_test.go` (new), `scripts/api-tour.sh`,
`frontend/src/app/lib/recentSearches.ts` (new), `frontend/src/app/search/page.tsx` (new),
`frontend/src/app/components/SideBar.tsx`, `frontend/scripts/integration-smoke.mjs`,
`README.md`, `backend/README.md`, `TODO.md`.

One P3 closed. The page is three answers rather than one query on purpose: people and groups
already had a `q`, and each endpoint carries its own rule about what the viewer may see — merging
them would mean re-implementing the post rule inside the merge, which is exactly how a search
becomes a way around the privacy levels. So the only new backend surface is the post half, and it is
the feed's own projection and fragment with one extra predicate on top.

Two decisions are worth the words. A blank `q` is a 400: the pattern it would become is `%%`, which
matches every post, so an accidental submit would read the feed back rather than nothing. And the
query is listed in the plan table with **no index**, which is a measurement rather than an omission
— the pattern starts with `%`, so nothing can serve it and the fragment is evaluated per row,
exactly as the feed was before 000013. Writing that case down is what stops a later reader from
adding an index the planner would never pick.

The one cleanup the change enabled: `likePattern` is now a function rather than the same escaping
expression written inline in `GroupRepository` and `SocialRepository`. The third use is what made it
worth extracting, and the two existing sites were switched to it in the same change, so there is one
rule instead of two copies and a newcomer — the failure mode being a search for `50%` that returns
the whole table.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` (the new `cmd/search_test.go`, the
plan test, and the tour-coverage check the new route extends), `npm run lint` (0 errors),
`npx tsc --noEmit`, `npm run build`, `node scripts/dead-modules.mjs` (0 of 62), and the browser
suite, which sweeps `/search` anonymously and asserts the page by name: one query, three surfaces,
and the term offered back after a reload.

Changed in the lightbox session (2026-10-01), for review:
`frontend/src/app/components/Lightbox.tsx` (new), `frontend/src/app/components/PostCard.tsx`,
`frontend/scripts/integration-smoke.mjs`, `README.md`, `TODO.md`.

One P3 closed, and the first frontend-only change in a while. A photo on a post or a comment used
to open the raw file in a new tab; it now opens in the application. The viewer is deliberately a
dialog rather than a styled `div`: it labels itself, takes focus while it is open, traps Tab, locks
the page behind it, and hands focus back to the picture it was opened from — which is the part a
viewer is usually missing, and the reason the browser check drives it with a real mouse click
(`clickAt`) rather than a scripted `.click()`, which would never focus the button in the first
place. The arrows and the arrow keys move through the set and wrap, Escape and a click on the
backdrop close it, and a horizontal swipe does the same on touch; the counter and the arrows only
appear when there is more than one picture, because a set of one has nowhere to move to.

The image it fetches is the `large` derivative. That is not a new decision so much as the one
`mediaVariant` already documented: its comment says the single-size call is for "a lightbox, say,
which is deliberately the whole thing". The viewer is that caller now, and it inherits the same
fallback the grid has — an upload with no such file is answered with the original.

Two things are written down rather than left implied. The item named `PostCard.tsx`, so that is
where the change stops: `DirectConversation.tsx` and `GroupActivity.tsx` still open their images in
a new tab, and each would need its own browser coverage before it moves. And the composer step in
the smoke suite now uploads two photos instead of one, because a single picture cannot show that
the arrow keys move — with one, the controls are not drawn at all, which is the behaviour the same
step asserts for the counter.

Evidence: `npm run lint` (0 errors), `npx tsc --noEmit`, `npm run build`, and
`node scripts/dead-modules.mjs`, which reports 0 modules with no importer out of 60 source files.
The browser suite passed end to end with the new step by name: "a photo opens in a lightbox, moves
with the arrow keys and closes on Escape".

Changed in the bookmarks session (2026-10-01), for review:
`backend/pkg/db/migrations/sqlite/000014_saved_posts.{up,down}.sql` (new),
`backend/pkg/app/repositories/SavedPostRepository.go` (new),
`backend/pkg/app/repositories/PostRepository.go`, `backend/pkg/app/service/PostService.go`,
`backend/pkg/app/handlers/SavedPostHandler.go` (new), `backend/pkg/models/Post.go`,
`backend/pkg/payload/posts/PostDTO.go`, `backend/cmd/router.go`,
`backend/cmd/saved_post_test.go` (new), `backend/pkg/db/sqlite/migrations_test.go`,
`scripts/api-tour.sh`, `frontend/src/app/api/social.ts`,
`frontend/src/app/components/PostCard.tsx`, `frontend/src/app/components/SideBar.tsx`,
`frontend/src/app/saved/page.tsx` (new), `frontend/scripts/integration-smoke.mjs`,
`README.md`, `backend/README.md`, `TODO.md`.

One P3 closed, the highest-value item left in Product extras. It is one migration and three
routes: a bookmark is a row keyed on `(userId, postId)`, and the list is the feed's projection
filtered by the same `postVisibility` fragment, so none of the privacy rules had to change to keep
bookmarks from leaking a post the viewer cannot read. The two writes are idempotent on purpose —
`ON CONFLICT DO NOTHING` for the insert, a plain delete for the removal — because a bookmark button
is pressed twice by accident and a 409 there would be noise; the answer is the resulting state, not
a change. A save of an unreadable post goes through `CanViewPost` first and answers 404, which is
the answer `GetPostByID` gives, so the endpoint cannot be used to learn that a post exists.

The one design choice worth recording: the item said "Saved tab", and the list is a `/saved` route
instead, behind a nav entry — the profile page renders *other* members' profiles too, so a private
list has no business being a tab on it. The feed and single-post DTOs carry a viewer-relative
`isSaved`; `GetPosts` fills it for a whole page with one `SavedPostIDs` query rather than one per
card, while `GetPostByID` uses the single-row `IsPostSaved`.

The session also found and fixed a latent deadlock that had nothing to do with bookmarks:
`PostRepository.GetPosts` issued its per-post `selectedUsers` query *inside* the loop that was still
iterating the feed's own `*Rows`, which waits forever when the pool holds a single connection —
exactly what `integrationServer` configures (`SetMaxOpenConns(1)`). The new test hit it immediately
by reading the feed as the post's author, which is the branch that runs the lookup. The rows are now
closed before that loop, with a comment saying why, and `SavedPosts` mirrors the order;
`defer rows.Close()` still covers the early returns inside the scan loop, so nothing leaks.

Evidence: `go build ./...`, `go vet ./...` and `go test ./...` across every package, including the
tour-coverage check (`cmd/api_tour_test.go`), which the three new routes extend, and the migration
round trip, whose pinned version moved 13 → 14. Frontend: `npm run lint` (0 errors),
`npx tsc --noEmit`, `npm run build` (now emits `/saved`), and the full browser suite, which passed
end to end and named the new step: "a post is saved from its card, listed on the private Saved page,
and dropped when un-saved" — and `/saved` joined the anonymous-redirect sweep, so the session gate
on the new route is pinned rather than assumed.

Changed in the media-derivatives session (2026-09-30), for review:
`backend/pkg/media/derive.go` (new), `backend/pkg/media/derive_test.go` (new),
`backend/pkg/app/handlers/{MediaHandler,MediaCleanup}.go`, `backend/cmd/media_derivatives_test.go` (new),
`backend/pkg/app/handlers/media_limits_test.go`, `frontend/src/app/lib/mediaVariants.ts` (new),
`frontend/src/app/lib/mediaLimits.ts`, `frontend/src/app/components/{Avatar,PostCard,GroupActivity,DirectConversation,StoriesBar}.tsx`,
`frontend/src/app/profile/page.tsx`, `frontend/scripts/integration-smoke.mjs`, `README.md`,
`DEPLOYMENT.md`, `backend/README.md`, `frontend/README.md`, `TODO.md`.

The highest-value item left, and the one I had been putting off because it touches every media read
path. It is one query parameter: `?size=thumb|large|original` on the route that already exists. That
single decision is what kept the change small — no migration, no new URL shape, no DTO changes —
because every media URL stored in a post, comment, story, message, avatar or group row still
resolves, and an upload with no derivative is answered with the original. The frontend can therefore
name both candidates in a `srcset` without knowing anything about the file, and an old row needs no
backfill: the worst case is a download that is bigger than it had to be.

Measured rather than asserted, on a 3200×2400 JPEG (777111 bytes): 192994 bytes as `large` and
46584 as `thumb`, which the Go tests decode to check the width instead of trusting a length, and the
same numbers again over HTTP in `cmd/media_derivatives_test.go`. The browser suite carries the
product claim itself: every request for a post's picture must carry a `?size=`, so a feed no longer
fetches the bare original — and the fixture is a 1x1 PNG, i.e. an upload that has no derivatives at
all, which makes it a test of the `srcset` being used for a file with nothing to choose between.

Four refusals are decisions and are documented as such, each with what it costs: no derivative of a
video (nothing in this toolchain decodes one), none of an animated GIF (a still frame is a different
picture rather than a smaller one), never an upscale, and PNG for every non-JPEG source so alpha
survives — that last one makes a photographic PNG derivative much larger than a JPEG would be, which
is written where the choice is made. The two caps live in `mediaLimits.ts` for the `srcset`
descriptors and in `pkg/media` for the resizing, and the drift check that already holds the upload
ceilings together grew two rows to hold these as well.

The part that would have been a bug rather than a feature: a derivative's name is not a UUID, so the
existing stray sweep would have treated every `_thumb`/`_large` file as something an operator had put
there and left it behind forever. The collector now removes them with their row and sweeps a stray
one, and the test asserts that it still refuses to touch `notes_large` and `notes.txt` — the promise
that sweep has always made is the reason it is careful about names at all. A first version of the
naming helper also taught me something worth keeping: `notes_large` *is* derivative-shaped, so the
UUID check belongs to the caller, and the test now says so instead of implying the helper does it.

Injecting a fault into that collector taught me one more thing about it: neutering the row prune's
derivative loop alone changed nothing, because the sweep I had just taught about derivative names
catches the same files on the same pass. Either half is enough for the outcome, so the demonstration
only fails when both are neutered — and the code comment now says which half exists for which case
(a row already known to be unreferenced should not wait another hour, and a file whose mtime was
touched after the grace window would never be swept at all). That is the sort of thing a test cannot
tell you and a fault can.

Honest limits, in the code and the docs rather than only here: the resize is synchronous, so an
upload is slower and a 12-megapixel photo decodes to about 140 MB of pixels while it is resized (the
40-megapixel ceiling is what bounds that); storage grows by roughly a third for a photo library; a
decode failure silently means "no derivative" rather than a failed upload; there is no EXIF-aware
rotation, so a derivative inherits the original's pixels; and the full-screen story view still asks
for the original, because that is where the whole picture is wanted. The lightbox item next to this
one is untouched and stays open — it is about how a picture is opened, not how it is fetched.


- P0-2 (comment media) is complete; it touched `PostCard.tsx` and `profile/page.tsx`.
- P0-3 is complete on the backend; the only missing piece is the frontend guard, handed off
  with the exact change list in that section. `canMessage` is still only a type in
  `frontend/src/app/api/social.ts`, so nothing reads the flag yet.
- No P0 items are open. What is left is the P1/P2/P3 list above.

Changed in the developer-experience session (2026-09-30), for review:
`Makefile` (new), `scripts/api-tour.sh` (new), `backend/cmd/api_tour_test.go` (new),
`backend/pkg/websocket/protocol_doc_test.go` (new), `backend/pkg/websocket/types.go`,
`backend/pkg/app/handlers/{ChatMutation,GroupContent,Notification,Social}Handler.go`,
`backend/README.md`, `README.md`, `frontend/README.md`, `TODO.md`.

Three P3s closed, all of them tools rather than product, and one left alone on purpose. The make
file is fourteen targets, each one line calling something that already existed; every target was
run for this commit except `dev`, and `make status` is why: a development server from an earlier
session still holds ports 4000 and 5174, which is exactly the case `run.sh` refuses to start into.
`make check` — backend build, vet and test, then frontend lint, types and build — exits 0, with the
same 19 pre-existing `no-img-element` warnings. There is no `stop` target, and that is a finding
rather than an omission: `./run.sh` knows those verbs only through the WSL launcher it delegates
to, so a `stop` here would have started a second stack, which is the sort of thing a wrapper is
supposed to prevent.

The API tour is the largest piece, and running it corrected four things a guess would have got
wrong. `POST /auth/register` and `POST /auth/login` read form values (`r.FormValue`) where the rest
of the API reads JSON. A wrong password is a 400 saying "invalid email or password", not a 401,
because the request was understood and refused rather than failing to authenticate. A socket
upgrade with no `Origin` is refused with 403 even when the cookie is valid, which is deliberate and
now pinned. And deleting a post cascades to its comments: the first version deleted the post first
and then could not explain a 403 about a comment that no longer existed. The tour runs 88 requests
across all 66 patterns in `router.go` against a scratch backend, and the coverage check earned its
place immediately — it found the one route the tour called without annotating it (`POST
/api/v1/media`, whose request is multipart and so was written outside the helper).
`backend/cmd/api_tour_test.go` reads both files and fails by name in both directions: a route with
no call, and a call to a route that does not exist. Its `untoured` map is empty and documented as
the place an exception has to be written down rather than the test weakened.

OpenAPI was rejected rather than postponed, and that is a decision with a cost worth revisiting if
a schema validator ever becomes available here: a hand-written schema cannot be validated in this
environment, and a document nothing checks will drift, while a tour is verified by being run.
`TODO.md` records the choice in those terms.

The protocol document is the other half. Five event names were still string literals at their send
sites — `message_changed`, `read_receipt`, `social_changed`, `group_changed` and
`notification_changed` — so they moved into `types.go` first, which makes "the events this server
can send" one list instead of a list plus a grep; that file came out of the change formatted, so
one of the three files the gofmt item names is now clean. Writing the tables found three things
worth knowing: `send_error` is declared and never produced, so a refused `private_msg` is silent to
the person who sent it; the `notification` event carries two different payload shapes depending on
whether a socket or a REST handler sent it, which nobody noticed because the frontend reloads its
list instead of reading the payload; and the write pump batches frames into one WebSocket message
separated by newlines, so a client has to split before parsing.
`pkg/websocket/protocol_doc_test.go` fails by name when a constant or a payload struct is missing
from the document, and in the other direction when the document names an event nothing sends, with
the client-only `connected` kept in a list of its own with its reason.


Changed in the query-index session (2026-09-30), for review:
`backend/pkg/db/migrations/sqlite/000013_query_indexes.{up,down}.sql` (new),
`backend/pkg/app/repositories/query_plan_test.go` (new),
`backend/pkg/app/repositories/{PostRepository,SocialRepository,CommentRepository,NotificationRepository,MessageRepository}.go`,
`backend/pkg/db/sqlite/migrations_test.go`, `backend/README.md`, `TODO.md`.

One P3 closed by measuring first and writing the migration second, which changed the answer
twice. The plan was to index the follow-request queries and review the feed; the review found
seven read paths scanning, and the item's two were not the worst of them. Before any index
existed, `EXPLAIN QUERY PLAN` on a seeded scratch database (3 000 posts, 3 000 comments,
9 000 reactions, 3 000 notifications, 800 follow requests, 900 accounts) showed the feed's
page as `SCAN p` plus a temporary b-tree for the order (~800 µs), the follow requests as a
scan and a sort (~22 µs), one post's comment count as a covering scan of every comment
(~38 µs) with its page a scan plus a sort (~52 µs), the unread count as `SCAN notification`
(~90 µs, and the sidebar runs it twice every fifteen seconds in every open tab), the
notifications page (~106 µs) and one entity's reaction total as `SCAN reaction` (~190 µs).
Two paths were measured too and need nothing, which is the other half of a review: the chat
list already reaches `message_conversation` through SQLite's multi-index OR, and the likes
tab reaches the reaction unique index through its leftmost prefix.

Migration 000013 adds six indexes, each with its measurement beside it in the file. The first
fixture was wrong and the numbers said so: with every notification and every follow request
belonging to the viewer, a `userId` or `recipientId` filter removed nothing, so the scan
measured as fast as the index and the evidence proved nothing — spreading those rows across
the accounts is what made the win visible, and the test now says why. The other finding worth
recording is a trap: adding `post(createdAt)` alone speeds the feed 22× and makes the profile
page *slower* (~60 µs → ~310 µs), because the planner then prefers it for the author's posts
and walks all 3 000 entries to find a handful. The two post indexes are one decision, and the
migration says so where the next person will read it.

The evidence lives in the test rather than in this note: `query_plan_test.go` asserts the plan
names the index, drops it to prove the plan changes without it, and restores it from the
CREATE statement read out of the migration, so an index renamed there fails by name instead of
quietly measuring nothing. It logs the wall clock on both sides; the plans are asserted and the
clock is not, because a wall clock is not a contract. Verified by injection as well: taking an
index out of the migration fails with `feed page does not use post_createdAt` and `follow
requests does not use connection_recipient_status`, and with them back the package is green.
The limits are stated in the migration header rather than implied — the numbers are a laptop's,
median of five runs, and move by ten or twenty per cent between runs; no production-sized
dataset stands behind them; and the write cost of six indexes is reasoned about (one per
written table, on tables that take single-row writes) but not measured.

`migrations_test.go` needed one edit, and it is not a weakening: the round-trip test pins the
final schema version, now 13. The first full run failed with `expected clean version 12, got
13`, which is the pin doing its job — it exists so that adding a migration is noticed and its
`down` file exercised, and the round trip over all thirteen passes after the bump. The comment
added there says so, so the next person knows the edit is deliberate.


Changed in the composer-and-limits session (2026-09-30), for review:
`frontend/src/app/lib/mediaLimits.ts` (new), `frontend/src/app/lib/postDraft.ts` (new),
`frontend/src/app/components/{ImagePicker,PostForm}.tsx`, `frontend/src/app/api/social.ts`,
`frontend/scripts/integration-smoke.mjs`, `backend/errors.go`,
`backend/pkg/app/handlers/{utils,MediaHandler,handlers_test}.go`,
`backend/pkg/app/handlers/media_limits_test.go` (new), `backend/cmd/media_upload_test.go`,
`README.md`, `DEPLOYMENT.md`, `frontend/README.md`, `TODO.md`.

Six P3s closed, all of them in the composer or in the limits the composer talks about, and one of
them turned out to be a measurement rather than a feature. The three copies of the ceilings became
one module per language — `lib/mediaLimits.ts` and the Go constants — and
`media_limits_test.go` reads the TypeScript file and compares them, because two languages cannot
share a literal and a comment asking people to keep them in step is not a check. Both directions
were demonstrated before it was trusted: changing `MAX_IMAGE_BYTES` alone, and changing
`maxImageUpload` alone, each fail it by name with both numbers printed, and the tree was restored
between. What it does *not* cover is the wording of the two byte formatters or the limit tables in
the READMEs; both gaps are written at the test and where a deployer reads them rather than implied
away.

The measured-size item was half done already and is now whole: the 413 named the ceiling, and now
names the file's own size with it. That required the status mapping to move from `==` to
`errors.Is`, because a sentinel wrapped in the new `ErrDetail` fell through to the default branch
and answered 500 for a request that was merely too large — a worse bug than the wording it
improves, which is why its injected-fault check is a revert of one case instead of a new test
(`expected 413 for a wrapped sentinel, got 500`). The 50 MB gate deliberately keeps the limit alone
and says why at the gate: it runs before the type is sniffed and the request ceiling is that number
plus a megabyte, so a measured size there would always read as the ceiling itself.

The composer work is three items that are really one behaviour. The button is no longer silently
disabled: the reason is computed from the draft, rendered beside it, attached to the field with
`aria-describedby`, and the caret moves to that field when a publish is refused — which is also why
the form is `noValidate`, since native bubbles would fire before the sentence could. The draft lives
in `localStorage` under `social:post-draft`, is scoped to a new post, cleared on publish and by
Discard, and read in a deferred task like ThemeProvider's so hydration cannot mismatch; it restores
the text and the audience and says on screen that the photos did not come back, because a `File`
cannot be serialised. The action row is sticky and is still one button, so nothing had to be
duplicated for assistive technology to trip over.

The browser suite carries all of it, since the frontend has no unit-test runner and this behaviour
belongs to the DOM and to storage: a too-short post shows its reason, the draft reaches storage and
survives a reload, Discard empties both, Ctrl+Enter publishes and clears the draft, the picker tile
reads `1 × 1 · 68 B`, and `/create-post` joined the responsive sweep at four widths because a sticky
row is exactly what overflows a narrow viewport. Two runs pass 31 steps each.

One failure came from running rather than reading, in a step this session did not touch: the
expired-session step lost a race with the sidebar's live-refresh poll. The evidence is in the two
runs' logs — in one the logout answer and two poll 401s landed in the same millisecond, the tab
reached `/login` first and the composer the step meant to type into was gone; in the other that step
saw no poll 401 at all and passed. It now types before it logs out and attempts the send
defensively, asserts the contract both paths share, and prints a NOTE when a poll wins. The first
attempt at that evidence injected a two-second pause and proved nothing — the poll interval is
fifteen seconds — so the claim was corrected and the run repeated with sixteen.

Two items in this file were corrected rather than obeyed. The WebP gap was already fixed by the
upload-hardening session and left open; it is ticked now, with the test that proves both directions
named as the evidence. And the baseline line at the top claimed both Docker images *build* through
`compose.yaml`, which was never measured anywhere — the daemon here answers 500 — so the claim is
withdrawn in favour of what is true: `docker compose config` exits 0 client-side, and the
`up --build` P2 below stays open for a host that can actually run it. Both P2s were left open and
untouched for the same reason as before: no Docker daemon and no CI runner with Go, a C compiler
and Chrome in one image.

Deliberately not started, so the next session can pick them up on purpose rather than by
accident: media derivatives (`_thumb`/`_large` + `srcset`), which change every media read path;
the Instagram-like shell; bookmarks and hashtags; the missing database indexes with their
`EXPLAIN QUERY PLAN` evidence; and the DX set (`make`/`just`, the WebSocket protocol document,
OpenAPI). The first of those is the highest-value item left and the one most likely to break
something, so it deserves a session of its own rather than the end of this one.

Changed in the password-reset session (2026-09-30), for review:
`backend/pkg/db/migrations/sqlite/000012_password_reset.{up,down}.sql` (new),
`backend/pkg/app/repositories/{PasswordResetRepository.go (new),SessionRepository,AuthRepository}.go`,
`backend/pkg/app/service/{PasswordResetService.go (new),Mailer.go (new),SessionManager,AuthService}.go`,
`backend/pkg/payload/user/PasswordResetDTOs.go` (new), `backend/pkg/app/handlers/{PasswordResetHandler.go (new),HandlerContext,utils}.go`,
`backend/errors.go`, `backend/cmd/{router,main}.go`, `backend/pkg/db/sqlite/migrations_test.go`,
`backend/cmd/password_reset_test.go` (new), `backend/pkg/app/service/Mailer_test.go` (new),
`frontend/src/app/{api/social.ts,login/page.tsx}`, `frontend/src/app/{forgot,reset}/page.tsx` (new),
`frontend/scripts/integration-smoke.mjs`, `README.md`, `DEPLOYMENT.md`, `TODO.md`.

The last open P2 that could be built here, closed as far as code can go. The item asked for a provider:
the choice is `net/smtp`, which is standard library (so no new dependency, and it is not deprecated in
this toolchain) behind a `Mailer` interface, with a log mailer for development and — deliberately —
nothing for production without SMTP, because a reset link in a log file is a working credential in a log
file. The token is 256 random bits, only its sha256 is stored, links are single-use and expire in 30
minutes, and redeeming one revokes every session the account had, cached tokens included: that last part
is `RevokeAllForUser`, which exists because `SaveSession`'s rotation has no equivalent for a flow with no
browser to hand a replacement token to. Single-use is a claim-once `UPDATE`, and there is a test that
races four confirms to prove it. The two properties the item called out — no enumeration oracle, and a
rate limit that does not itself become one — are pinned by tests that compare the two answers and apply
the limit to an unknown address as well. Two limits are recorded rather than implied: no real provider
has been exercised (an in-process stub is not a mail service) and the uniform answer is uniform in status
and body but not in timing.

Changed in the browser-CI session (2026-09-30), for review:
`frontend/scripts/integration-smoke.mjs`, `.github/workflows/ci.yml`, `.gitlab-ci.yml`, `README.md`,
`DEPLOYMENT.md`, `frontend/README.md`, `TODO.md`.

The browser-suite-in-CI item got its writable half: both CI files now carry the job **opt-in** —
`when: manual` in GitLab, `workflow_dispatch`-only on GitHub — with the three things it needs in one
container named in the job comments (Go, because the harness shells out to `go build`; a C compiler,
because the SQLite driver is CGO; and a Chrome binary). Writing it turned up a portability bug the item
implied but nobody had hit: `integration-smoke.mjs` fell back to a hardcoded **Windows** Chrome path, so
a Linux runner without `CHROME_PATH` died with `spawn … ENOENT` under an "Unhandled 'error' event"
banner. It now probes the usual install locations per platform and fails by name, verified both ways by
running the `HEAD` version of the script against the same bogus path. The job itself is still
**unverified** — it has never run on a runner — so that item stays open, and `DEPLOYMENT.md` says so
where a deployer will read it.

Running the suite to verify the Chrome change turned up a flake worth more than the job it was meant to
serve: the first of two runs failed at "Timed out: register form". The cause was measured rather than
guessed — that run's frontend log contains **no** `/register` request at all, so the click meant to open
the form never started a navigation. It landed before React attached its handler, on a tab `createPage`
had just opened, where the button is present in the server-rendered HTML; and because the old code
clicked once and then waited, a single missed click was a permanent stall rather than a diagnosable
failure. `buttonThen` now clicks again while waiting for what the click should cause and reports when it
needed more than one, with the assertion unchanged. Demonstrated by injecting the failure: with the first
click swallowed — exactly the observed miss — the step passes and prints `NOTE: the register link took 2
clicks; the first landed before hydration`, where the same miss failed the suite before. Two clean runs
pass 29 steps.

Changed in the base-image-pin session (2026-09-30), for review:
`scripts/pin-base-images.mjs` (new), `backend/Dockerfile`, `frontend/Dockerfile`, `.gitlab-ci.yml`,
`.github/workflows/ci.yml`, `DEPLOYMENT.md`, `README.md`, `TODO.md`.

One Deployment P2 closed by resolving the conflict its own item contains instead of obeying it. The
Dockerfiles floated the Go patch on purpose — a current patch is what clears govulncheck's
standard-library findings — so pinning a digest freezes precisely that. The pin therefore arrived with a
check that notices when it is behind: `scripts/pin-base-images.mjs` resolves each tag against Docker Hub,
rewrites the pin with `--write`, and reads the toolchain out of the image config, so "pinned at an opaque
digest" becomes "pinned at go1.26.8 / node22.23.3 / docker27.5.1". Eleven references across both
Dockerfiles and `.gitlab-ci.yml` now carry the multi-arch index digest, so one pin serves amd64 and
arm64; the CI toolchain keeps floating, because CI is not the artifact that ships. The check runs in both
pipelines as `base-images` and only reports — a new upstream patch is not a defect in the commit that
notices it.
Evidence, all against the live registry: exit 1 while unpinned, exit 0 after `--write`, the check passing
twice more with the tree unchanged, drift forced with the real `golang:1.26.7-bookworm` digest (which
reported "(golang1.26.8)  was (golang1.26.7)" and exited 1), and a bogus tag exiting 2 without touching a
file. The script's first run caught its own bug: the pattern captured the pin as bare hex where the
registry reports `sha256:<hex>`, so a correctly pinned file read as drifted and the pinned toolchain could
not be looked up.
Two limits are recorded rather than implied: the check needs Docker Hub reachable, and the pins are
verified to *resolve* rather than to build, because there is still no daemon here. Mid-session Docker Hub
also started answering **429** to anonymous pulls, which is why the check now names a rate limit instead
of reporting it as a resolution failure — and why the last confirmation of the `docker:27` pin is worth
repeating from a clear address.


Changed in the build-guard and stories-decision session (2026-09-28), for review:
`frontend/next.config.ts`, `.github/workflows/ci.yml`, `.gitlab-ci.yml`, `frontend/README.md`,
`backend/pkg/app/repositories/SocialRepository.go`, `DEPLOYMENT.md`, `TODO.md`.

Two P2s closed. The `BACKEND_URL` guard took the assertion half of its item rather than the runtime
half, and says why: the address is compiled into the rewrites, so runtime configuration would mean
owning a proxy process instead of a rewrite. It now also refuses a malformed value and a trailing
slash, and both CI workflows pass a placeholder so their build matches the image's shape. Verified by
failing it three ways and then passing it. The stories item was a decision rather than a feature, and
it is now recorded at the rule itself, in the deployment notes and in the README that had been
pointing at the item while it was open, with the cost of an audience written down so the choice can
be revisited on purpose.
Evidence: `go build ./...`/`go vet ./...` and the repository plus cmd tests pass with the comment
added to `CanViewMedia`; `npm run build` passes with `BACKEND_URL` set and fails with each of the
three bad shapes; `frontend/README.md` and `DEPLOYMENT.md` describe the guard.

Changed in the load-smoke session (2026-09-28), for review:
`backend/cmd/load_smoke_test.go` (new), `frontend/scripts/integration-smoke.mjs`, `README.md`,
`DEPLOYMENT.md`, `TODO.md`.

One Testing and Release P2 closed, split by what each harness can carry honestly: the Go harness
owns the fifty-socket fan-out, the sustained throughput and the rate-limiter boundary, because it has
its own per-peer bucket and no other traffic; the browser suite owns the fifty sockets through the
proxy, which is the only place Next's upgrade path meets concurrency. Both halves failed once before
they passed, and both failures are recorded: the browser step first sent its message while fifty
handshakes were still finishing (a frame with no handler attached is dropped by the browser), and its
100-request burst then tripped the shared 1,200-a-minute limiter, 429'ing every following step and
threatening the console-error guard — which is why throughput moved to Go rather than being tuned
down. Evidence: `go test ./...` passes with the three new tests (50 broadcasts in ~2 ms, ~6,700 req/s
reported, limiter boundary pinned), and the browser suite passes 29 steps with no console errors.

Changed in the dates and dead-modules session (2026-09-28), for review:
`frontend/src/app/api/social.ts`, `frontend/src/app/components/PostCard.tsx`,
`frontend/src/app/notifications/page.tsx`, `frontend/scripts/{dead-modules.mjs,integration-smoke.mjs}`,
`frontend/README.md`, `README.md`, the deletion of `frontend/src/app/components/{MessageItem,ProfileModel,StoryViewer,UserProfileInfo}.tsx`,
`frontend/src/app/lib/imageSrc.ts`, `frontend/src/app/types/{story,RegisterRequestDTO}.ts`, `TODO.md`.

One reliability P2 closed and the dead-code sweep finished properly. The dates item measured in two
directions: `dateLabel` was already locale-aware, so that half was recorded rather than rewritten,
and the only relative formatter in the tree was inside a component nothing imports — which is what
led to the sweep. That sweep is now a script rather than a guess, because guessing missed dead files
twice; it found six more modules, and it reports 0 of 53. The new console-error assertion in the
browser suite is the measurement behind the hydration question the item raises: `toLocaleString()`
runs on the server as well as in the browser, and in this app that produces no complaints, since
every date shown comes from data fetched after mount. Evidence: `npx tsc --noEmit` clean, `npm run
lint` 0 errors with 19 warnings (four fewer, from the deleted components' `no-img-element`), `npm run
build` succeeds, and the browser suite passes 28 steps — including the new console-error guard and the
relative-label assertion.

Changed in the optimistic-feedback and dead-code session (2026-09-28), for review:
`frontend/src/app/components/PostCard.tsx`, `frontend/src/app/discover/page.tsx`,
`frontend/src/app/profile/page.tsx`, `frontend/public/assets.ts`,
`frontend/scripts/integration-smoke.mjs`, the deletion of
`frontend/src/app/components/{StoryCarousel,StoryCard,StoryItem,UserCard,StoryModal}.tsx`, `TODO.md`.

Two reliability P2s and one P3 closed, all three after measuring rather than as written. The
fixtures item turned out to be dead code instead of missing empty states — the two fallbacks it named
had no references at all, and the only fixture still in use fed components nothing imported, which
is how five dead components rather than two came to be deleted. The optimistic-updates item split in
half: reactions already avoided refetches and only needed to become optimistic, while follow/unfollow
really did refetch — including through the `social_changed` echo the follow endpoint pushes to the
actor, which the new browser assertion caught and reading alone had missed. Evidence:
`npx tsc --noEmit` clean, `npm run lint` 0 errors with 23 warnings (five fewer, because the deleted
components carried `no-img-element` warnings), `npm run build` succeeds, and the browser suite passes
27 steps including two new assertions that a follow click does not re-read the profile's post list.

Changed in the upload-hardening session (2026-09-28), for review:
`backend/pkg/app/handlers/MediaHandler.go`, `backend/cmd/media_upload_test.go`, `backend/go.mod`,
`backend/go.sum`, `README.md`, `DEPLOYMENT.md`, `TODO.md`.

One Authentication and Security P2 closed, and the measurement is the interesting part: most of what
the item asked for was already true, one of its suggestions would have broken the product, and the
hole that did exist was in a corner the item never mentioned. The dimension check was skipped for
WebP, so a header-only WebP could declare a 16384×16384 canvas — 268 megapixels from a few dozen
bytes — and be accepted; reverting the fix makes the new test fail with `got 201`, so that is
confirmed rather than inferred. The read path now also holds the *stored* type to the same
allow-list and downloads anything else instead of rendering it. Re-encoding was rejected with
reasons — it covers two of the six formats and would rotate every phone photo without an
EXIF-aware rotation step — and `Content-Disposition: attachment` on media would have broken every
inline image in the app. Evidence: `go build ./...`/`go vet ./...`/`go test ./...` pass (nine
packages), the four new upload cases pass (including the fail-then-pass check above), and the
browser suite passes 27 steps with no runtime exceptions. One dependency was added, pinned to the
release that keeps the `go` directive at 1.25.

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
