# Social Network Project TODO

Legend: `[x]` verified working on `main` @ `cb91348` unless an item notes local verification · `[ ]` open · **P0** blocks a mandatory
spec line · **P1** required before release · **P2** polish · **P3** nice to have.

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
- [ ] **P1** Frontend: disable the "Message" action with an explanation when messaging is
  not allowed — `frontend/src/app/profile/page.tsx` and `frontend/src/app/discover/page.tsx`.
  The blocker is gone (the pagination rework that owned both files is committed), so this is
  two conditions on the existing `Message` links plus the viewer-relative `canMessage` flag
  that `GET /api/v1/users/{userId}` returns (typed as an optional `canMessage` in
  `frontend/src/app/api/social.ts`). Until then a blocked attempt fails with the backend's 403
  toast, which is correct but less friendly.
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
- [ ] **P2** Paginate the members and requests lists (currently fetch-all).
- [ ] **P2** Split upcoming and past events, and add an event reminder.
- [ ] **P2** Tests for leave / remove / transfer / delete authorization edges (owner cannot
  be removed, non-owner cannot remove others).

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
- [ ] **P1** Document and test the security headers set in `backend/cmd/security.go`
  (CSP, HSTS, `X-Content-Type-Options`) by asserting them on an API response.
- [ ] **P1** Add per-account login throttling or lockout on top of the per-peer IP limit,
  since the frontend proxy hides real client IPs.
- [ ] **P1** Write down the CSRF reasoning (`SameSite=Lax` cookies plus JSON-only mutations)
  or add a token.
- [ ] **P1** Run `npm audit` and `govulncheck ./...`, then fix or justify each finding in CI.
- [ ] **P2** Harden uploads further: re-encode images or serve them with
  `Content-Disposition: attachment` and a restrictive CSP so an HTML/SVG payload cannot be
  used for stored XSS.
- [ ] **P2** Add password change / reset (not required by the spec, required by any real
  deployment).
- [ ] **P2** Rotate the session token on privilege change and on password change.

## Reliability and UX

- [x] Responsive shell with a collapsible desktop sidebar and a focus-trapped mobile
  drawer (`SideBar.tsx:22-46`), plus loading/empty/error components used across pages
  (`Loading`, `RequestState`, `error.tsx`, `not-found.tsx`).
- [x] Failures are reported with `react-hot-toast` rather than inline blocks, per the
  recent refactor commits (`ae86292`, `c4b5a46`, `4483030`).
- [ ] **P1** Media and upload edge cases: files over the 51 MiB cap, zero-byte files, an
  extension that disagrees with the detected MIME, and orphaned `media` rows when the
  referencing post, comment, story or message is deleted.
- [ ] **P1** Verify the `postVisibility` SQL fragment
  (`SocialRepository.go:113,150` and the `CommentRepository` equivalent) covers every read
  path: feed, single post, profile posts, likes tab, comments, and direct media access.
  Follow-request smoke investigation: an existing selected audience entry still grants
  post/media access after unfollow; audit whether that access should require a current follow.
- [ ] **P1** Add error, empty and loading states for the new P0 flows (follow requests,
  comment media) following the toast convention. Progress 2026-09-28: the comment composer
  reports upload and validation failures with `react-hot-toast`, its list already had a
  spinner plus `LoadMore`, and the profile media tab now has a skeleton and a "No photos yet."
  empty state; the follow-request half is unchanged.
- [ ] **P1** Reconnect/offline UX: `BackendProvider.tsx:94` retries the socket every 3 s with
  no visible state — surface the existing `connected` context value in the UI.
- [ ] **P1** Accessibility pass: apply the drawer's focus trap and Escape handling to
  `EditProfile`, `StoriesBar` and `GroupConversation` dialogs; confirm `aria-live` on the
  unread badge; check colour contrast on the teal/blue gradients.
- [ ] **P1** Responsive review at 320 / 375 / 768 / 1440 px for messages, group chat,
  profile, notifications, and the new follow-request screens.
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
- [ ] **P1** Rewrite the top-level `README.md`: it is still the verbatim assignment text and
  never describes what was built, the stack, the folder layout, or how to run it.
- [ ] **P1** Document the `frontend/src/proxy.ts` middleware and the `/api/v1` + `/ws`
  rewrite contract in `frontend/README.md` (currently only partially covered).
- [ ] **P1** Add CI (GitHub Actions or the school equivalent) running `go vet`, `go test`,
  `npm ci`, `npm run lint`, `npm run build`, `docker compose build`, `npm audit`.
- [ ] **P1** Run and record a real backup → wipe → restore drill of the `social-data` volume
  using `sqlite3 .backup`, and verify uploaded media is included.
- [ ] **P2** Verify `docker compose config` and a full `docker compose up --build` on a clean
  host; record the first-run steps and the expected log lines in `DEPLOYMENT.md`.
- [ ] **P2** Add health/readiness endpoints and container healthchecks (`compose.yaml`
  currently relies only on `depends_on`).
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
- [ ] **P1** Add direct tests for the packages that have none: `pkg/app/handlers`,
  `pkg/app/repositories`, `pkg/middleware`, `pkg/websocket` — they are currently only
  exercised indirectly through `cmd/*_test.go`.
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
- [ ] **P2** Add a WebSocket test for private-message delivery plus rejection of a
  non-permitted sender.
- [ ] **P2** Load smoke: 50 concurrent WebSocket clients and sustained request throughput
  through the frontend proxy, confirming the rate limiter behaves.
- [ ] **P2** Add `npm run lint` and `npm run build` to the definition of done for every PR.
- [ ] **P2** Record the release checklist (build, migrate, backup, deploy, verify, rollback)
  in `DEPLOYMENT.md`.

## Housekeeping and Cleanup

- [x] **P0** Untrack the live SQLite database. `backend/pkg/db/socialnetwork.db` is committed
  and shows as modified in `git status`; add it to `.gitignore` (which currently only
  ignores `realTimeForum.db`) and `git rm --cached`.
- [x] **P1** Delete dead code: `frontend/src/app/components/MenuItems.tsx` (never imported)
  and the unused `menuItemsData` / `dummy*Data` exports in `frontend/public/assets.ts`.
  `MenuItems.tsx`, `menuItemsData` and the lucide import it needed are gone. The `dummy*`
  fixtures stay for now because `dummyStoriesData` is still imported by `StoryCard` and
  `StoryCarousel`; they go with the empty-state work above.
- [x] **P1** Remove the stale Clerk and `NEXT_PUBLIC_DEV_USER` references listed under
  Authentication and Security.
- [ ] **P1** Keep this file current. The previous revision marked shipped features (group
  chat, group events, both Docker images) as unchecked while omitting the real gaps, which
  is worse than having no TODO at all.
- [ ] **P2** Decide the fate of the legacy redirect-only routes: `frontend/src/app/connections/page.tsx`
  and the `follows` entry still present in the stale `.next-smoke` build output.
- [ ] **P2** Confirm `.next/`, `.next-smoke/`, `backend/tmp/` and `backend/uploads/` stay
  untracked (verified: only the database is currently tracked) and add them to
  `.gitignore` explicitly rather than relying on the `tmp` pattern.
- [ ] **P2** Review `frontend/scripts/run-integration.mjs` versus
  `scripts/run-wsl.sh` for duplicated launcher logic and merge what overlaps.
- [ ] **P2** Delete the generated `.next-smoke` directory from the working tree and document
  `NEXT_DIST_DIR` as the supported way to get a second build directory.

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
  lazy loading for free.
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
