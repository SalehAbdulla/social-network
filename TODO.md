# Social Network Project TODO

Legend: `[x]` verified working on `main` @ `cb91348` unless an item notes local verification · `[ ]` open · **P0** blocks a mandatory
spec line · **P1** required before release · **P2** polish · **P3** nice to have.

Baseline checks: `go test ./...` passes, `go vet ./...` is clean, both Docker images build
through `compose.yaml`, and migrations `000001`–`000009` are applied at boot by
`backend/pkg/db/sqlite/sqlite.go`.

Working today: auth (register/login/logout, bcrypt, cookie sessions), public/private
profiles, followers/following lists, posts with three privacy levels, reactions, comments,
groups (create/browse/invite/request/accept/post/comment/event+RSVP/chat/transfer/leave),
notifications with WebSocket push and a sidebar badge, media uploads
(JPEG/PNG/GIF/WebP/MP4/WebM), stories, and realtime chat with typing, read receipts and
presence.

Known spec-level gaps, detailed below: media on comments (P0-2), notification-vs-message
distinction (P0-4), and register-form field parity (P0-5).
Closed on 2026-09-28: chat permission rules (P0-3) and durable sessions (P0-6); see
"Work in flight and handoff" at the end of this file for what is still in someone else's
hands.

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

### P0-2 · Comments cannot carry an image or GIF

Spec: "While creating a post or a comment, the user can include an image or GIF." The
`comment` table has no media column, `CommentRepository.CreateComment` takes only text, and
the composer in `frontend/src/app/components/PostCard.tsx:23-24` posts `URLSearchParams`.
Related: `CommentHandler.go:114` rejects any non-ASCII comment, so comment emoji are
blocked too.

- [ ] **P0** Migration `000009_comment_media.up.sql` / `.down.sql`:
  `ALTER TABLE comment ADD COLUMN imageUrls TEXT NOT NULL DEFAULT '[]'`, mirroring
  `post.imageUrls` from `000002_social_features.up.sql`.
- [ ] **P0** Thread media through `CommentRepository.CreateComment`/`GetComments`, the
  `comment` domain model, and the `comment.CommentDTO` / `CommentResponse` payloads.
- [ ] **P0** `CreateComments` (`backend/pkg/app/handlers/CommentHandler.go:85`): accept
  `imageUrls` (JSON body instead of form values), validate each with
  `SocialService.ValidateMedia(userID, url, "image")`, cap the count, and loosen the
  ASCII-only gate at line 114 so emoji are allowed.
- [ ] **P0** Frontend: `ImagePicker` in the comment composer, JSON post body, and render
  the images in the comment list and the profile media grid.
- [ ] **P1** Extend `CommentService.DeleteComment` and the `comment_cleanup` trigger so
  attached media rows are cleaned up with the comment.
- [ ] **P1** Tests: comment with an image, invalid media URL rejected, foreign media URL
  rejected, comment media removed with the comment.

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
  not allowed — `frontend/src/app/profile/page.tsx:341` and
  `frontend/src/app/discover/page.tsx`. **Handed off**: both files are being rewritten on the
  pagination branch, so the change is two conditions on the existing `Message` links plus the
  `canMessage` flag that `GET /api/v1/users/{userId}` now returns (typed as an optional
  `canMessage` in `frontend/src/app/api/social.ts`). Until then a blocked attempt fails with
  the backend's 403 toast, which is correct but less friendly.
- [x] **P1** Tests: mutual follow allowed, one-way follow allowed, stranger → public profile
  allowed, stranger → private profile rejected, WS push rejected for the same case.

### P0-4 · Notifications are not visually distinct from messages

Spec: "New notifications are different from new private messages and should be displayed in
a different way!" Today one red badge counts both (`frontend/src/app/components/SideBar.tsx:77`
over an `entityType IN (...)` list that includes `message`), and `notifications/page.tsx:31`
renders message rows with markup identical to follow/group rows.

- [ ] **P0** Split the indicators: bell badge for social/group notifications, a separate
  message indicator on the Messages entry, with different colours and icons.
- [ ] **P0** Restyle `entityType === 'message'` rows on the notifications page as a
  distinct card (different accent, "Open chat" call to action).
- [ ] **P1** Add a `?types=` / `exclude=messages` filter to `GET /api/v1/notifications` and
  to `NotificationRepository.GetUnreadCount` so the bell badge can exclude messages.
- [ ] **P1** Test asserting the bell count excludes `message` rows and the message count
  excludes everything else.

### P0-5 · Register form does not match the required field list

Spec requires Email, Password, First Name, Last Name and Date of Birth, and requires
Avatar/Image, Nickname and About Me to be *present in the form but skippable*. Currently the
form (`frontend/src/app/login/page.tsx`, register branch) has no Avatar or About Me input,
Nickname is mandatory, and the profile silently defaults to public.

- [ ] **P0** Add optional Avatar and About Me inputs with an upload preview, sending the
  URL from `POST /api/v1/media`.
- [ ] **P0** Persist them: extend `user.RegisterRequestDTO`,
  `AuthService.Register`, and `AuthRepository.InsertUser`.
- [ ] **P0** Make Nickname genuinely optional — auto-generate a unique handle
  (`ValidateNickname`, `user.nickName NOT NULL UNIQUE`, and every `/profile/{id}` link assume
  it exists) or default it and document the deviation.
- [ ] **P1** Offer a public/private choice at signup instead of defaulting `isPublic = 1`.
- [ ] **P1** Test: registering with only the mandatory fields succeeds, and a supplied
  avatar/bio shows up on the profile.

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
math) and `pkg/db/sqlite/migrations_test.go` (up → down → up over all nine migrations, plus a
check that 000009 carries existing tokens over).

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
- [ ] **P1** Route `group_request`, `group_invitation` and `group_event` notifications
  through `NotificationService.CreateNotification` instead of the raw SQL inserts in
  `GroupRepository.go:91,196` and `GroupContentRepository.go:54`, so they push over the hub
  at creation time instead of relying on a refetch.
- [ ] **P1** Make group-event notifications deep-link to the event rather than the group
  overview (`notificationPath` in `notifications/page.tsx:11`).
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
  comment media) following the toast convention.
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
- [ ] **P1** Cover every P0 flow with tests: follow requests, comment media, chat permission
  rules, register field parity, notification type separation, and session persistence.
  Progress 2026-09-28: follow requests, the chat permission rules and session persistence are
  covered in Go; the other three still have none.
- [ ] **P1** Extend the browser smoke suite to the follow-request and comment-image journeys.
- [x] **P1** Add a migration test that runs `up` → `down` → `up` over all nine migrations on
  a scratch database. `backend/pkg/db/sqlite/migrations_test.go` does exactly that and also
  checks that 000009 keeps existing session rows.
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
  work, and review the feed query with `EXPLAIN QUERY PLAN`.
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

The paginated-feed rework recorded below is now complete and validated (`npm run build` clean,
`npm run test:integration` green on 2026-09-28): `LoadMore.tsx`, `Skeletons.tsx` and
`usePagedList.ts` are the new list primitives, and `Pagination.tsx` is deleted. Treat the list
files as settled unless a task explicitly targets them.

A second agent is reworking the paginated feed UI in the same working tree (new
`LoadMore.tsx`, `Skeletons.tsx` and `usePagedList.ts`; `Pagination.tsx` deleted; `page.tsx`,
`PostCard.tsx`, `messages/page.tsx`, `notifications/page.tsx`, `profile/page.tsx`,
`discover/page.tsx`, `StoriesBar.tsx`, `GroupActivity.tsx` and `DirectConversation.tsx`
touched). The work recorded above deliberately avoids those files:

- P0-2 (comment media) and P0-4 (notification vs message styling) both need `PostCard.tsx`,
  the notifications page and `SideBar.tsx`, so both are untouched and still open.
- P0-3 is complete on the backend; the only missing piece is the frontend guard, handed off
  with the exact change list in that section.
- Any bullet that mentions keeping `Pagination` as a fallback was written before that
  component was deleted, so re-read it before acting on it.

Changed in the 2026-09-28 session, for review: `backend/pkg/db/migrations/sqlite/000009_*`,
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
