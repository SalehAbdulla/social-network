# Social Network Project TODO

Legend: `[x]` verified working on `main` @ `16a755b` · `[ ]` open · **P0** blocks a mandatory
spec line · **P1** required before release · **P2** polish.

Baseline checks: `go test ./...` passes, `go vet ./...` is clean, both Docker images build
through `compose.yaml`, and migrations `000001`–`000008` are applied at boot by
`backend/pkg/db/sqlite/sqlite.go`.

Working today: auth (register/login/logout, bcrypt, cookie sessions), public/private
profiles, followers/following lists, posts with three privacy levels, reactions, comments,
groups (create/browse/invite/request/accept/post/comment/event+RSVP/chat/transfer/leave),
notifications with WebSocket push and a sidebar badge, media uploads
(JPEG/PNG/GIF/WebP/MP4/WebM), stories, and realtime chat with typing, read receipts and
presence.

Known spec-level gaps, detailed below: the follow-request workflow (P0-1), media on
comments (P0-2), chat permission rules (P0-3), notification-vs-message distinction (P0-4),
register-form field parity (P0-5), and durable sessions (P0-6).

## P0 — Spec-critical gaps

### P0-1 · Follow-request workflow (absent)

Spec: following is a request the recipient accepts or declines, and a public profile
bypasses that. Today `SocialRepository.FollowUser`
(`backend/pkg/app/repositories/SocialRepository.go:98`) inserts straight into `follow`
regardless of `isPublic`, and the `connection` table from `000002_social_features.up.sql`
(`status IN ('pending','accepted')`) is referenced by no Go file.

- [ ] **P0** Rework `FollowUser`: target `isPublic = 1` → insert into `follow`; private
  target → insert `connection(requesterId, recipientId, 'pending')`.
- [ ] **P0** Add pending-in/pending-out flags to `models.SocialUser` and populate them in
  `SocialRepository.SocialProfile` so the UI can render Follow / Requested / Following.
- [ ] **P0** New routes in `backend/cmd/router.go`: `GET /api/v1/follow-requests`
  (incoming pending), `PUT /api/v1/follow-requests/{userId}` (accept → promote to
  `follow`), `DELETE /api/v1/follow-requests/{userId}` (decline → drop the row).
- [ ] **P0** Repository methods plus `SocialService` validation: no self-requests, reject
  when already following, already pending, or a reverse request exists (auto-accept that
  case or require an explicit decision — document the choice).
- [ ] **P0** Add `follow_request` to the three `entityType IN (...)` allow-lists in
  `backend/pkg/app/repositories/NotificationRepository.go` (count, unread count, list) and
  raise the notification when a request is sent.
- [ ] **P0** Push it over the hub via `re.socialNotification` (`SocialHandler.go:181`),
  which already handles the `follow` type.
- [ ] **P0** Frontend: pending-request surface (new page or a section in
  `frontend/src/app/notifications/page.tsx`) with accept/decline actions.
- [ ] **P0** Frontend: three-state follow button in `frontend/src/app/profile/page.tsx:86`
  (`handleToggleFollow`) and `frontend/src/app/discover/page.tsx:27`, which currently use a
  plain `isFollowing` boolean.
- [ ] **P1** Keep `DELETE /users/{userId}/follow` working for unfollow, and make it cancel
  an outstanding request instead of erroring.
- [ ] **P1** Test `backend/cmd/follow_request_test.go`: public auto-follow, private pending,
  accept, decline, duplicate request, self-request, and the notification rows.

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

### P0-3 · Private chat ignores the follow rule

Spec: messages are only possible between users where at least one follows the other, and a
message is delivered instantly when the recipient follows the sender or has a public
profile. `SocialService.ValidateTarget`
(`backend/pkg/app/service/SocialService.go:57`) only checks that the target exists and is
not the sender, so today anyone can DM anyone, and
`ChatMutationHandler.go:61` notifies any online recipient.

- [ ] **P0** Add `SocialService.CanMessage(actor, target)`: allowed when a `follow` row
  exists in either direction, or when the target is `isPublic = 1`.
- [ ] **P0** Enforce it in `ChatMutationHandler.SendChatMessage` (line 38), `ReadChat`
  (line 132), `MessageService.SendMessage`, and `MessageRepository.GetChatUsers` so
  non-permitted threads never appear in the inbox.
- [ ] **P0** Enforce the same rule for WebSocket delivery in
  `WebSocketHandler.handlePrivateMessage` (`backend/pkg/app/handlers/WebSocketHandler.go:94`).
- [ ] **P0** Decide the migration story for existing `message` rows that predate the rule
  (keep them readable, or hide the threads) and document it.
- [ ] **P1** Frontend: disable the "Message" action with an explanation when messaging is
  not allowed — `frontend/src/app/profile/page.tsx:341` and
  `frontend/src/app/discover/page.tsx`.
- [ ] **P1** Tests: mutual follow allowed, one-way follow allowed, stranger → public profile
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

### P0-6 · Sessions are in-memory; the `session` table is dead code

`backend/pkg/app/service/SessionManager.go` keeps tokens in Go maps and
`000001_create_users_table.up.sql` creates a `session` table that nothing reads or writes, so
a backend restart signs everyone out (`DEPLOYMENT.md:20`) and the app cannot scale past one
instance.

- [ ] **P0** Persist sessions in the `session` table (token, `userId`, `expiresAt`, plus
  `createdAt`/`lastSeenAt` if sliding expiry is wanted).
- [ ] **P0** Point `CreateSession` / `GetUserIdByToken` / `DeleteSession` at the database,
  keeping the in-memory map as a cache, and preserve the "logging in revokes the previous
  token" behaviour (`SessionManager.go:32`).
- [ ] **P0** Add periodic cleanup of expired rows.
- [ ] **P0** Separate presence (`Presence` / `IsUserOnline`, 60 s window) from session
  lifetime so the chat "online" dot cannot be confused with auth state.
- [ ] **P1** Add sliding expiry (refresh on activity, absolute cap at 30 days) and an idle
  timeout.
- [ ] **P1** Tests: session survives a simulated restart, an expired token is rejected,
  logout deletes the row.
- [ ] **P1** Update `DEPLOYMENT.md` and `backend/README.md`, which currently document the
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
- [ ] **P0** Remove the query-string token fallback in `WebSocketHandler.ServeWs`
  (`backend/pkg/app/handlers/WebSocketHandler.go:30`) — the cookie is already forwarded by
  the Next.js rewrites and query tokens leak into logs and history.
- [ ] **P0** Tighten `allowedOrigin` (`backend/pkg/app/handlers/SocialHandler.go:40`): it
  returns `true` when the `Origin` header is absent, so non-browser clients can open a
  socket. Require the header for upgrades.
- [ ] **P1** Clear the stale auth documentation: `frontend/.env.example` ("Keep your
  existing Clerk keys"), the same line in `frontend/README.md`, and the Clerk entries that
  used to be in this file.
- [ ] **P1** Drop `NEXT_PUBLIC_DEV_USER` from `frontend/.env.local` and the matching warning
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
- [ ] **P2** Add infinite scroll or a "load more" affordance to the feed alongside the
  existing `Pagination` component.
- [ ] **P2** Confirm pagination is applied to stories and profile media, not just posts.

## Deployment and Documentation

- [x] `backend/Dockerfile` and `frontend/Dockerfile`: multi-stage builds, non-root users,
  separate `social-network-backend` / `social-network-frontend` images.
- [x] `compose.yaml`: `social-data` named volume, migrations auto-applied on boot, only port
  4000 published (bound to loopback), `restart: unless-stopped`.
- [x] `DEPLOYMENT.md` documents `APP_ENV`, `FRONTEND_ORIGIN`, `DATABASE_PATH`, `UPLOAD_DIR`,
  `PORT`, `LOG_LEVEL`, rate limits, body limits, and backup/rollback guidance.
- [x] Local developer launcher: `run.sh` plus `scripts/run-wsl.sh`, with port-conflict
  checks and child-process cleanup.
- [ ] **P1** Add a root `.env.example` (`APP_ENV`, `FRONTEND_ORIGIN`) — `DEPLOYMENT.md:9`
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
- [ ] **P1** Extend the browser smoke suite to the follow-request and comment-image journeys.
- [ ] **P1** Add a migration test that runs `up` → `down` → `up` over all nine migrations on
  a scratch database.
- [ ] **P2** Add a WebSocket test for private-message delivery plus rejection of a
  non-permitted sender.
- [ ] **P2** Load smoke: 50 concurrent WebSocket clients and sustained request throughput
  through the frontend proxy, confirming the rate limiter behaves.
- [ ] **P2** Add `npm run lint` and `npm run build` to the definition of done for every PR.
- [ ] **P2** Record the release checklist (build, migrate, backup, deploy, verify, rollback)
  in `DEPLOYMENT.md`.

## Housekeeping and Cleanup

- [ ] **P0** Untrack the live SQLite database. `backend/pkg/db/socialnetwork.db` is committed
  and shows as modified in `git status`; add it to `.gitignore` (which currently only
  ignores `realTimeForum.db`) and `git rm --cached`.
- [ ] **P1** Delete dead code: `frontend/src/app/components/MenuItems.tsx` (never imported)
  and the unused `menuItemsData` / `dummy*Data` exports in `frontend/public/assets.ts`.
- [ ] **P1** Remove the stale Clerk and `NEXT_PUBLIC_DEV_USER` references listed under
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

## Definition of done

A task is complete when: the code builds (`go build ./...`, `npm run build`), tests pass
(`go test ./...`, `npm run test:integration` where relevant), lint and vet are clean,
documentation touched by the change is updated, and this file is ticked with a one-line note
about what changed.
