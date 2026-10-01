#!/bin/sh
# Calls the API end to end without a browser: every route in backend/cmd/router.go, in the order
# the product uses them, with the status each one should answer.
#
#   make dev                        # in one terminal
#   make api-tour                   # in another, or: BASE_URL=... sh scripts/api-tour.sh
#
# It writes to whatever database the backend is using, so point it at a scratch one if that
# matters: DATABASE_PATH=/tmp/tour.db UPLOAD_DIR=/tmp/tour-uploads PORT=5199 go run ./cmd
#
# Every request carries a `# route:` comment naming the pattern it exercises, and
# backend/cmd/api_tour_test.go fails if one of those patterns is not in the router (or if a
# router pattern is missing here), so a renamed route lands as a failing test rather than as a
# 404 at run time. The tour leaves its two accounts behind and removes everything else it made.
#
# Dependencies: curl, openssl (for the upload fixture), python3 (to read a field out of a
# response). All three are present on macOS and on the usual Linux images.

set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:5174}"
STAMP="$(date +%s)"
EMAIL_A="tour-a-$STAMP@example.com"
EMAIL_B="tour-b-$STAMP@example.com"
EMAIL_RESET="tour-reset-$STAMP@example.com"
PASSWORD='TourPassword123!'
CHANGED_PASSWORD='TourPassword456!'

WORK="$(mktemp -d)"
JAR_A="$WORK/a.cookies"
JAR_B="$WORK/b.cookies"
BODY="$WORK/body.json"
FIXTURE="$WORK/pixel.png"
trap 'rm -rf "$WORK"' EXIT

PASSED=0

say() { printf '%s\n' "$*"; }

# The 1x1 PNG the upload tests use, written from base64 so the script needs no fixture file.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=' \
	| openssl base64 -d -A > "$FIXTURE"

# field <file> <dotted.path>: prints one value out of a response envelope, so an id can be
# captured from one call and used in the next.
field() {
	python3 -c '
import json, sys
value = json.load(open(sys.argv[1]))
for key in sys.argv[2].split("."):
    value = value[int(key)] if key.isdigit() else value[key]
print(value if isinstance(value, (str, int, float)) else json.dumps(value))
' "$1" "$2"
}

# check <expected-status> <actual-status> <label>: one line per request, or the response body,
# the label and curl's own message and then a stop.
check() {
	want="$1"; status="$2"; label="$3"
	if [ "$status" = "$want" ]; then
		PASSED=$((PASSED + 1))
		printf 'PASS %s -> %s\n' "$label" "$status"
		return
	fi
	printf 'FAIL %s -> %s, expected %s\n' "$label" "$status" "$want"
	head -c 400 "$BODY" 2>/dev/null || true
	printf '\n'
	if [ -s "$WORK/curl.err" ]; then
		printf 'curl: '
		cat "$WORK/curl.err"
	fi
	exit 1
}

# call <jar> <method> <path> <expected-status> [body] [content-type]
#
# Two of these endpoints read form values rather than JSON — `POST /auth/register` and
# `POST /auth/login` use `r.FormValue`, which is why the tour passes
# `application/x-www-form-urlencoded` for those two and leaves the default for the rest. That
# asymmetry is worth knowing before writing a client by hand, which is half of why this script
# exists; the frontend's own login call uses URLSearchParams for the same reason.
call() {
	jar="$1"; method="$2"; path="$3"; want="$4"; body="${5:-}"; ctype="${6:-application/json}"
	if [ -n "$body" ]; then
		status="$(curl -sS -o "$BODY" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" \
			-H 'Accept: application/json' -H "Content-Type: $ctype" --data "$body" \
			"$BASE_URL$path" 2>"$WORK/curl.err" || true)"
	else
		status="$(curl -sS -o "$BODY" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" \
			-H 'Accept: application/json' "$BASE_URL$path" 2>"$WORK/curl.err" || true)"
	fi
	check "$want" "$status" "$method $path"
}

# ws_status <jar> [origin]: the status of an upgrade attempt. The Origin matters: the upgrader
# refuses an upgrade without one (and the session cookie is checked first, so no cookie is a 401
# whatever the Origin). `FRONTEND_ORIGIN` is the same variable the backend reads, so pointing the
# tour at a backend with a different origin configured needs only that variable set.
ws_status() {
	jar="$1"; origin="${2:-${FRONTEND_ORIGIN:-http://localhost:4000}}"
	if [ "$origin" = "none" ]; then
		curl -sS -o "$BODY" -w '%{http_code}' -b "$jar" -c "$jar" \
			-H 'Connection: Upgrade' -H 'Upgrade: websocket' \
			-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
			"$BASE_URL/ws" 2>"$WORK/curl.err" || true
		return
	fi
	curl -sS -o "$BODY" -w '%{http_code}' -b "$jar" -c "$jar" \
		-H "Origin: $origin" \
		-H 'Connection: Upgrade' -H 'Upgrade: websocket' \
		-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
		"$BASE_URL/ws" 2>"$WORK/curl.err" || true
}

say "Touring $BASE_URL (accounts $EMAIL_A / $EMAIL_B)"

# --- probes, before anything is authenticated -------------------------------------------------

# route: GET /api/v1/health
call "$JAR_A" GET /api/v1/health 200
# route: GET /api/v1/ready
call "$JAR_A" GET /api/v1/ready 200

# --- accounts --------------------------------------------------------------------------------

# route: POST /api/v1/auth/register
call "$JAR_A" POST /api/v1/auth/register 201 \
	"firstName=Tour&lastName=One&email=$EMAIL_A&nickname=toura$STAMP&password=$PASSWORD&confirmPassword=$PASSWORD&birthDate=2000-01-01&gender=male&isPublic=true" \
	application/x-www-form-urlencoded
USER_A="$(field "$BODY" data.userId)"
# route: POST /api/v1/auth/register
call "$JAR_B" POST /api/v1/auth/register 201 \
	"firstName=Tour&lastName=Two&email=$EMAIL_B&nickname=tourb$STAMP&password=$PASSWORD&confirmPassword=$PASSWORD&birthDate=2000-01-01&gender=female&isPublic=true" \
	application/x-www-form-urlencoded
USER_B="$(field "$BODY" data.userId)"
# The same address and nickname again: refused, and the tour asserts the refusal rather than
# reusing the account, because the ids captured above must not move.
# route: POST /api/v1/auth/register
call "$JAR_A" POST /api/v1/auth/register 400 \
	"firstName=Tour&lastName=One&email=$EMAIL_A&nickname=toura$STAMP&password=$PASSWORD&confirmPassword=$PASSWORD&birthDate=2000-01-01&gender=male" \
	application/x-www-form-urlencoded

# route: POST /api/v1/auth/login
call "$JAR_A" POST /api/v1/auth/login 200 "identifier=$EMAIL_A&password=$PASSWORD" \
	application/x-www-form-urlencoded
# The wrong password is refused with the same sentence an unknown address gets — a 400, because
# `ErrInvalidCredentials` is a bad request rather than an unauthenticated one: the request was
# understood and refused, it did not fail to authenticate a session.
# route: POST /api/v1/auth/login
call "$JAR_A" POST /api/v1/auth/login 400 "identifier=$EMAIL_A&password=NotThePassword123!" \
	application/x-www-form-urlencoded
# route: POST /api/v1/auth/login
call "$JAR_A" POST /api/v1/auth/login 200 "identifier=$EMAIL_A&password=$PASSWORD" \
	application/x-www-form-urlencoded

# A reset for an address that exists and one that does not, answered identically on purpose:
# telling them apart would be a registration oracle.
# route: POST /api/v1/auth/password-reset
call "$JAR_A" POST /api/v1/auth/password-reset 202 "{\"email\":\"$EMAIL_A\"}"
# route: POST /api/v1/auth/password-reset
call "$JAR_A" POST /api/v1/auth/password-reset 202 "{\"email\":\"$EMAIL_RESET\"}"
# An unusable token is refused with one sentence whether it expired, was spent or never existed.
# route: POST /api/v1/auth/password-reset/confirm
call "$JAR_A" POST /api/v1/auth/password-reset/confirm 400 \
	"{\"token\":\"not-a-real-token\",\"password\":\"$CHANGED_PASSWORD\",\"confirmPassword\":\"$CHANGED_PASSWORD\"}"

# route: GET /api/v1/auth/nickname-availability
call "$JAR_A" GET "/api/v1/auth/nickname-availability?nickname=toura$STAMP" 200
# route: GET /api/v1/auth/nickname-availability
call "$JAR_A" GET "/api/v1/auth/nickname-availability?nickname=tourfree$STAMP" 200

# route: GET /api/v1/auth/me
call "$JAR_A" GET /api/v1/auth/me 200

# The socket is part of the API and its upgrade is an ordinary HTTP request, with three outcomes
# worth pinning: 101 for a session with an Origin the backend allows, 401 with no session at all,
# and 403 for no Origin — the last one is deliberate, because a socket that cannot say where it
# came from is the cross-site case the check exists for.
# route: GET /ws
check 101 "$(ws_status "$JAR_A")" "GET /ws (session cookie and an allowed Origin)"
# route: GET /ws
check 401 "$(ws_status "$WORK/absent.cookies")" "GET /ws (no session cookie)"
# route: GET /ws
check 403 "$(ws_status "$JAR_A" none)" "GET /ws (no Origin)"

# --- posts, comments, reactions and media -----------------------------------------------------

# route: POST /api/v1/posts
call "$JAR_A" POST /api/v1/posts 201 \
	'{"title":"Tour post","content":"A post created by the API tour.","imageUrls":[],"privacy":"public","selectedFollowerIds":[]}'
POST_A="$(field "$BODY" data.postId)"
# route: GET /api/v1/posts
call "$JAR_A" GET "/api/v1/posts?page=1&size=10&sortBy=createdat&sortOrder=desc" 200
# route: GET /api/v1/post
call "$JAR_A" GET "/api/v1/post?id=$POST_A" 200
# route: GET /api/v1/posts/search
call "$JAR_A" GET "/api/v1/posts/search?q=Tour&page=1&size=10" 200
# route: PUT /api/v1/posts/{postId}
call "$JAR_A" PUT "/api/v1/posts/$POST_A" 200 \
	'{"title":"Tour post, edited","content":"Edited by the API tour. #reboot","imageUrls":[],"privacy":"public","selectedFollowerIds":[]}'

# The post now carries a hashtag, so the tag page has something to answer with. A tag
# that nothing carries is an empty page rather than an error, which is the other half.
# route: GET /api/v1/hashtags/{tag}
call "$JAR_A" GET "/api/v1/hashtags/reboot?page=1&size=10" 200
# route: GET /api/v1/hashtags/{tag}
call "$JAR_A" GET "/api/v1/hashtags/nothingcarriesthis" 200

# An upload first, so the post can carry an image and the media route has something to serve.
# route: POST /api/v1/media
upload_status="$(curl -sS -o "$BODY" -w '%{http_code}' -b "$JAR_A" -c "$JAR_A" \
	-F "file=@$FIXTURE;type=image/png" "$BASE_URL/api/v1/media" 2>"$WORK/curl.err" || true)"
check 201 "$upload_status" "POST /api/v1/media (multipart)"
MEDIA_A="$(field "$BODY" data.url)"
# route: GET /api/v1/media/{id}
call "$JAR_A" GET "$MEDIA_A" 200
# The allow-list is enforced on the way out too: with the id of no row at all, a 404.
# route: GET /api/v1/media/{id}
call "$JAR_A" GET "/api/v1/media/00000000-0000-0000-0000-000000000000" 404

# route: POST /api/v1/reactions
call "$JAR_A" POST /api/v1/reactions 200 "{\"entityType\":\"post\",\"entityId\":$POST_A,\"score\":1}"
# route: POST /api/v1/posts/comments
call "$JAR_B" POST /api/v1/posts/comments 201 "{\"postId\":$POST_A,\"content\":\"A comment from the API tour.\",\"imageUrls\":[]}"
COMMENT_B="$(field "$BODY" data.commentId)"
# route: GET /api/v1/posts/comments
call "$JAR_A" GET "/api/v1/posts/comments?postId=$POST_A&page=1&size=10&sortBy=createdat&sortOrder=desc" 200
# route: PUT /api/v1/posts/comments/{id}
call "$JAR_B" PUT "/api/v1/posts/comments/$COMMENT_B" 200 '{"content":"A comment from the API tour, edited."}'
# route: POST /api/v1/reactions
call "$JAR_B" POST /api/v1/reactions 200 "{\"entityType\":\"comment\",\"entityId\":$COMMENT_B,\"score\":1}"

# --- saved posts --------------------------------------------------------------------------------

# A bookmark is private to the account that made it, so the tour saves A's own post, lists it and
# removes it again. Both writes answer with the state they produced rather than with a change,
# which is why saving twice would be a 200 too.
# route: POST /api/v1/posts/{postId}/save
call "$JAR_A" POST "/api/v1/posts/$POST_A/save" 200
# route: GET /api/v1/saved-posts
call "$JAR_A" GET "/api/v1/saved-posts?page=1&size=10" 200
# route: DELETE /api/v1/posts/{postId}/save
call "$JAR_A" DELETE "/api/v1/posts/$POST_A/save" 200

# --- following, including the request a private profile needs ---------------------------------

# route: GET /api/v1/users
call "$JAR_A" GET "/api/v1/users?page=1" 200
# route: GET /api/v1/users/{userId}
call "$JAR_A" GET "/api/v1/users/$USER_B" 200
# A mention only has the text of a handle, so this is the route that turns one into the
# account it names; an unknown handle is a 404 rather than an empty profile.
# route: GET /api/v1/handles/{nickname}
call "$JAR_A" GET "/api/v1/handles/tourb$STAMP" 200
# route: GET /api/v1/handles/{nickname}
call "$JAR_A" GET "/api/v1/handles/nobody$STAMP" 404
# route: PUT /api/v1/users/me
call "$JAR_A" PUT /api/v1/users/me 200 \
	"{\"firstName\":\"Tour\",\"lastName\":\"One\",\"nickname\":\"toura$STAMP\",\"aboutMe\":\"Touring the API.\",\"isPublic\":true}"
# route: GET /api/v1/users/{userId}/posts
call "$JAR_A" GET "/api/v1/users/$USER_A/posts" 200
# route: GET /api/v1/users/{userId}/media
call "$JAR_A" GET "/api/v1/users/$USER_A/media" 200
# route: GET /api/v1/users/{userId}/follows
call "$JAR_A" GET "/api/v1/users/$USER_A/follows" 200

# A public profile is followed immediately.
# route: PUT /api/v1/users/{userId}/follow
call "$JAR_A" PUT "/api/v1/users/$USER_B/follow" 200
# route: DELETE /api/v1/users/{userId}/follow
call "$JAR_A" DELETE "/api/v1/users/$USER_B/follow" 200

# B turns private, so the next follow is a request the owner decides. Both decisions are taken
# here, because a request nobody answers is a state the tour would leave behind.
call "$JAR_B" PUT /api/v1/users/me 200 \
	"{\"firstName\":\"Tour\",\"lastName\":\"Two\",\"nickname\":\"tourb$STAMP\",\"aboutMe\":\"\",\"isPublic\":false}"
# route: PUT /api/v1/users/{userId}/follow
call "$JAR_A" PUT "/api/v1/users/$USER_B/follow" 200
# route: GET /api/v1/follow-requests
call "$JAR_B" GET "/api/v1/follow-requests" 200
# route: DELETE /api/v1/follow-requests/{userId}
call "$JAR_B" DELETE "/api/v1/follow-requests/$USER_A" 200
# route: PUT /api/v1/users/{userId}/follow
call "$JAR_A" PUT "/api/v1/users/$USER_B/follow" 200
# route: PUT /api/v1/follow-requests/{userId}
call "$JAR_B" PUT "/api/v1/follow-requests/$USER_A" 200

# --- stories ----------------------------------------------------------------------------------

# route: POST /api/v1/stories
call "$JAR_A" POST /api/v1/stories 201 "{\"content\":\"A story from the API tour.\",\"backgroundColor\":\"#4f46e5\",\"mediaUrl\":\"\",\"mediaType\":\"text\"}"
STORY_A="$(field "$BODY" data.storyId)"
# route: GET /api/v1/stories
call "$JAR_A" GET /api/v1/stories 200
# route: DELETE /api/v1/stories/{id}
call "$JAR_A" DELETE "/api/v1/stories/$STORY_A" 200

# --- notifications ------------------------------------------------------------------------------

# B commented on A's post and liked it, so A has notifications to read.
# route: GET /api/v1/notifications
call "$JAR_A" GET "/api/v1/notifications?page=1&size=10" 200
NOTIFICATION_A="$(field "$BODY" data.notifications.0.notificationId)"
# route: GET /api/v1/notifications/unread-count
call "$JAR_A" GET /api/v1/notifications/unread-count 200
# route: PATCH /api/v1/notifications/{notificationId}/read
call "$JAR_A" PATCH "/api/v1/notifications/$NOTIFICATION_A/read" 200
# route: PATCH /api/v1/notifications/read-all
call "$JAR_A" PATCH /api/v1/notifications/read-all 200

# --- private messages ---------------------------------------------------------------------------

# A follows B by now, which is the rule the chat endpoints and the socket share.
# route: POST /api/v1/messages
call "$JAR_A" POST /api/v1/messages 201 \
	"{\"recipientId\":\"$USER_B\",\"text\":\"A message from the API tour.\",\"mediaUrl\":\"\",\"mediaType\":\"\"}"
MESSAGE_A="$(field "$BODY" data.messageId)"
# route: PUT /api/v1/messages/{id}
call "$JAR_A" PUT "/api/v1/messages/$MESSAGE_A" 200 '{"text":"A message from the API tour, edited."}'
# route: GET /api/v1/messages/users
call "$JAR_A" GET /api/v1/messages/users 200
# route: GET /api/v1/messages
call "$JAR_A" GET "/api/v1/messages?partnerId=$USER_B&page=1&size=20" 200
# route: POST /api/v1/messages/read
call "$JAR_B" POST /api/v1/messages/read 200 "{\"partnerId\":\"$USER_A\"}"
# A reaction on a message is a participant's alone, and it is here rather than anywhere else
# because the delete below is what proves the reaction goes with the message.
# route: POST /api/v1/reactions
call "$JAR_B" POST /api/v1/reactions 200 "{\"entityType\":\"message\",\"entityId\":$MESSAGE_A,\"score\":1}"
# route: DELETE /api/v1/messages/{id}
call "$JAR_A" DELETE "/api/v1/messages/$MESSAGE_A?scope=me" 200

# --- groups -------------------------------------------------------------------------------------

# route: POST /api/v1/groups
call "$JAR_A" POST /api/v1/groups 201 '{"title":"Tour group","description":"Created by the API tour."}'
GROUP_A="$(field "$BODY" data.groupId)"
# route: GET /api/v1/groups
call "$JAR_A" GET /api/v1/groups 200
# route: GET /api/v1/groups/{groupId}
call "$JAR_A" GET "/api/v1/groups/$GROUP_A" 200

# B is invited first and declines, then asks to join and is let in: both halves of the membership
# flow, and neither an invitation nor a request is left unanswered.
# route: POST /api/v1/groups/{groupId}/invite/{userId}
call "$JAR_A" POST "/api/v1/groups/$GROUP_A/invite/$USER_B" 200
# route: GET /api/v1/groups/invitations
call "$JAR_B" GET /api/v1/groups/invitations 200
INVITATION_B="$(field "$BODY" data.0.invitationId)"
# route: PUT /api/v1/groups/{groupId}/invitations/{invitationId}
call "$JAR_B" PUT "/api/v1/groups/$GROUP_A/invitations/$INVITATION_B" 200 '{"status":"declined"}'
# route: POST /api/v1/groups/{groupId}/join
call "$JAR_B" POST "/api/v1/groups/$GROUP_A/join" 200
# route: GET /api/v1/groups/{groupId}/requests
call "$JAR_A" GET "/api/v1/groups/$GROUP_A/requests" 200
REQUEST_B="$(field "$BODY" data.0.requestId)"
# route: PUT /api/v1/groups/{groupId}/requests/{requestId}
call "$JAR_A" PUT "/api/v1/groups/$GROUP_A/requests/$REQUEST_B" 200 '{"status":"accepted"}'
# route: GET /api/v1/groups/{groupId}/members
call "$JAR_A" GET "/api/v1/groups/$GROUP_A/members" 200

# The content kinds: posts and events are writable, timeline and media are reads, and a comment
# needs the post it hangs off.
# route: POST /api/v1/groups/{groupId}/content/{kind}
call "$JAR_A" POST "/api/v1/groups/$GROUP_A/content/posts" 201 '{"title":"Tour group post","content":"Hello from the tour.","mediaUrl":"","startsAt":""}'
CONTENT_A="$(field "$BODY" data.id)"
# route: GET /api/v1/groups/{groupId}/content/{kind}
call "$JAR_A" GET "/api/v1/groups/$GROUP_A/content/posts" 200
# route: GET /api/v1/groups/{groupId}/content/{kind}
call "$JAR_A" GET "/api/v1/groups/$GROUP_A/content/timeline" 200
# route: GET /api/v1/groups/{groupId}/content/{kind}
call "$JAR_A" GET "/api/v1/groups/$GROUP_A/content/media" 200
# route: POST /api/v1/groups/{groupId}/content/{kind}
call "$JAR_B" POST "/api/v1/groups/$GROUP_A/content/comments?parentId=$CONTENT_A" 201 '{"content":"A group comment from the tour."}'
# route: POST /api/v1/groups/{groupId}/content/{kind}
call "$JAR_A" POST "/api/v1/groups/$GROUP_A/content/events" 201 '{"title":"Tour event","content":"A group event from the tour.","mediaUrl":"","startsAt":"2030-01-01T10:00:00.000Z"}'
EVENT_A="$(field "$BODY" data.id)"
# route: PUT /api/v1/groups/{groupId}/events/{eventId}/rsvp
call "$JAR_B" PUT "/api/v1/groups/$GROUP_A/events/$EVENT_A/rsvp" 200 '{"status":"going"}'
# route: PUT /api/v1/groups/{groupId}/content/{kind}/{id}
call "$JAR_A" PUT "/api/v1/groups/$GROUP_A/content/posts/$CONTENT_A?parentId=0" 200 '{"title":"Tour group post, edited","content":"Edited by the tour.","mediaUrl":"","startsAt":""}'
# route: DELETE /api/v1/groups/{groupId}/content/{kind}/{id}
call "$JAR_A" DELETE "/api/v1/groups/$GROUP_A/content/posts/$CONTENT_A?parentId=0" 200
# route: PUT /api/v1/groups/{groupId}
call "$JAR_A" PUT "/api/v1/groups/$GROUP_A" 200 '{"title":"Tour group, renamed","description":"Renamed by the API tour."}'

# Ownership moves to B, which is what makes the last two calls legal: an owner may remove a member,
# and only an owner may delete the group at all.
# route: PUT /api/v1/groups/{groupId}/members/{userId}
call "$JAR_A" PUT "/api/v1/groups/$GROUP_A/members/$USER_B" 200 '{"role":"owner"}'
# route: DELETE /api/v1/groups/{groupId}/members/{userId}
call "$JAR_B" DELETE "/api/v1/groups/$GROUP_A/members/$USER_A" 200
# route: DELETE /api/v1/groups/{groupId}
call "$JAR_B" DELETE "/api/v1/groups/$GROUP_A" 200

# --- the rest of the account, and the tour's own cleanup -----------------------------------------

# Deleting a post is scoped to its author, and a stranger gets a 404 rather than a 403: whether
# the post exists is not something an outsider is told. The tour pins both, which is why the
# author deletes it here — before the logout below takes their session away.
# route: DELETE /api/v1/posts/comments
call "$JAR_B" DELETE "/api/v1/posts/comments?id=$COMMENT_B" 200
# route: DELETE /api/v1/posts
call "$JAR_B" DELETE "/api/v1/posts?id=$POST_A" 404
# route: DELETE /api/v1/posts
call "$JAR_A" DELETE "/api/v1/posts?id=$POST_A" 200

# route: PUT /api/v1/users/me/password
call "$JAR_A" PUT /api/v1/users/me/password 200 \
	"{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"$CHANGED_PASSWORD\",\"confirmPassword\":\"$CHANGED_PASSWORD\"}"
# The old password stops working and the new one starts: that rotation is the point of the
# endpoint, and it is also what the changed session cookie has to survive.
# route: POST /api/v1/auth/login
call "$JAR_A" POST /api/v1/auth/login 400 "identifier=$EMAIL_A&password=$PASSWORD" \
	application/x-www-form-urlencoded
# route: POST /api/v1/auth/login
call "$JAR_A" POST /api/v1/auth/login 200 "identifier=$EMAIL_A&password=$CHANGED_PASSWORD" \
	application/x-www-form-urlencoded

# route: GET /api/v1/auth/me
call "$JAR_A" GET /api/v1/auth/me 200
# route: POST /api/v1/auth/logout
call "$JAR_A" POST /api/v1/auth/logout 200
# And the effect of it: the session is gone, so the same call is refused.
# route: GET /api/v1/auth/me
call "$JAR_A" GET /api/v1/auth/me 401

say ""
say "$PASSED requests, each with the status it should have had."
say "Left behind on purpose: $EMAIL_A and $EMAIL_B, because the tour needs two accounts."
say "The uploaded 1x1 PNG is left to the media collector, which reclaims an upload nothing"
say "references once the grace window passes."

