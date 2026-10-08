package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"social-network/backend/pkg/app/repositories"

	"golang.org/x/crypto/bcrypt"
)

const (
	showcasePassword = "Password123!"

	postIDBase    = 1000
	commentIDBase = 2000
	storyIDBase   = 3000
	notifIDBase   = 4000
	messageIDBase = 5000
	groupIDBase   = 6000
	contentIDBase = 7000
)

func seedShowcase(database *repositories.DB, uploadsDir string) error {
	rng := rand.New(rand.NewSource(20260101))
	now := time.Now().UTC()

	tx, err := database.Conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	exec := tx.Exec
	ids, err := insertShowcaseMembers(exec)
	if err != nil {
		return fmt.Errorf("seed members: %w", err)
	}
	for _, base := range []struct{ handle, email string }{{"dummyuser", "dummy@example.com"}, {"alexdemo", "alex@example.com"}} {
		var id string
		if err := tx.QueryRow("SELECT userId FROM user WHERE email = ?", base.email).Scan(&id); err != nil {
			return fmt.Errorf("resolve %s: %w", base.email, err)
		}
		ids[base.handle] = id
	}

	media := &mediaSeeder{exec: exec, dir: uploadsDir}
	if err := attachProfilePictures(exec, media, ids, rng); err != nil {
		return fmt.Errorf("seed profile pictures: %w", err)
	}
	if err := insertFollows(exec, ids, rng); err != nil {
		return fmt.Errorf("seed follows: %w", err)
	}
	if err := insertPosts(exec, media, ids, now, rng); err != nil {
		return fmt.Errorf("seed posts: %w", err)
	}
	if err := insertStories(exec, media, ids, now, rng); err != nil {
		return fmt.Errorf("seed stories: %w", err)
	}
	if err := insertGroups(exec, media, ids, now, rng); err != nil {
		return fmt.Errorf("seed groups: %w", err)
	}
	if err := insertMessages(exec, media, ids, now, rng); err != nil {
		return fmt.Errorf("seed messages: %w", err)
	}
	if err := insertNotifications(tx, ids, now); err != nil {
		return fmt.Errorf("seed notifications: %w", err)
	}
	if err := insertSavedPosts(exec, ids); err != nil {
		return fmt.Errorf("seed saved posts: %w", err)
	}
	if err := recomputeCounters(exec); err != nil {
		return fmt.Errorf("recompute counters: %w", err)
	}
	return tx.Commit()
}

func formatTime(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05") }

func jsonURLs(urls []string) string {
	if len(urls) == 0 {
		return "[]"
	}
	encoded, err := json.Marshal(urls)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}

func initialsFor(first, last string) string {
	first = strings.TrimSpace(first)
	last = strings.TrimSpace(last)
	switch {
	case first != "" && last != "":
		return strings.ToUpper(string([]rune(first)[0:1]) + string([]rune(last)[0:1]))
	case first != "":
		return strings.ToUpper(string([]rune(first)[0:min(2, len([]rune(first)))]))
	case last != "":
		return strings.ToUpper(string([]rune(last)[0:min(2, len([]rune(last)))]))
	default:
		return "?"
	}
}

type execFunc func(query string, args ...any) (sql.Result, error)

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func memberHandles() []string {
	handles := []string{"dummyuser", "alexdemo"}
	for _, m := range showcaseMembers {
		handles = append(handles, m.Handle)
	}
	return handles
}

func insertShowcaseMembers(exec execFunc) (map[string]string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(showcasePassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	ids := make(map[string]string, len(showcaseMembers))
	for _, m := range showcaseMembers {
		id := "seed-" + m.Handle
		ids[m.Handle] = id
		if _, err := exec(`INSERT INTO user
			(userId, email, password, firstName, lastName, nickName, birthYear, gender, aboutMe, location, birthDate, isPublic)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(userId) DO UPDATE SET
			  email=excluded.email, password=excluded.password, firstName=excluded.firstName, lastName=excluded.lastName,
			  nickName=excluded.nickName, birthYear=excluded.birthYear, gender=excluded.gender, aboutMe=excluded.aboutMe,
			  location=excluded.location, birthDate=excluded.birthDate, isPublic=excluded.isPublic, updatedAt=datetime('now')`,
			id, m.Handle+"@example.com", string(hash), m.First, m.Last, m.Handle, m.BirthYear, m.Gender,
			m.Bio, m.Location, fmt.Sprintf("%04d-01-01", m.BirthYear), boolInt(m.Public)); err != nil {
			return nil, fmt.Errorf("member %s: %w", m.Handle, err)
		}
	}
	return ids, nil
}

func attachProfilePictures(exec execFunc, media *mediaSeeder, ids map[string]string, rng *rand.Rand) error {
	set := func(column, url, owner string) error {
		_, err := exec("UPDATE user SET "+column+"=? WHERE userId=?", url, owner)
		return err
	}
	for _, m := range showcaseMembers {
		owner := ids[m.Handle]
		if m.Avatar {
			url, err := media.save("avatar:"+m.Handle, owner, avatarImage(rng, initialsFor(m.First, m.Last)))
			if err != nil {
				return err
			}
			if err := set("avatar", url, owner); err != nil {
				return err
			}
		}
		if m.Cover {
			url, err := media.save("cover:"+m.Handle, owner, coverImage(rng))
			if err != nil {
				return err
			}
			if err := set("coverPhoto", url, owner); err != nil {
				return err
			}
		}
	}
	for _, base := range []struct{ handle, first, last string }{{"dummyuser", "Dummy", "User"}, {"alexdemo", "Alex", "Demo"}} {
		owner := ids[base.handle]
		url, err := media.save("avatar:"+base.handle, owner, avatarImage(rng, initialsFor(base.first, base.last)))
		if err != nil {
			return err
		}
		if err := set("avatar", url, owner); err != nil {
			return err
		}
		cover, err := media.save("cover:"+base.handle, owner, coverImage(rng))
		if err != nil {
			return err
		}
		if err := set("coverPhoto", cover, owner); err != nil {
			return err
		}
	}
	return nil
}

func insertFollows(exec execFunc, ids map[string]string, rng *rand.Rand) error {
	insert := func(follower, followed string) error {
		if follower == followed {
			return nil
		}
		_, err := exec(`INSERT INTO follow (followerId, followedId) VALUES (?, ?) ON CONFLICT DO NOTHING`, ids[follower], ids[followed])
		return err
	}
	for _, edge := range showcaseFollows {
		if err := insert(edge[0], edge[1]); err != nil {
			return err
		}
	}
	sources := make([]string, 0, len(showcaseMembers))
	targets := make([]string, 0, len(showcaseMembers))
	for _, m := range showcaseMembers {
		sources = append(sources, m.Handle)
		if m.Public {
			targets = append(targets, m.Handle)
		}
	}
	for _, from := range sources {
		for i := 0; i < 1+rng.Intn(3); i++ {
			if err := insert(from, targets[rng.Intn(len(targets))]); err != nil {
				return err
			}
		}
	}
	for _, req := range showcasePending {
		if _, err := exec(`INSERT INTO connection (requesterId, recipientId, status, createdAt)
			VALUES (?, ?, 'pending', datetime('now')) ON CONFLICT DO NOTHING`, ids[req[0]], ids[req[1]]); err != nil {
			return err
		}
	}
	return nil
}

func photoSize(rng *rand.Rand) (int, int) {
	switch rng.Intn(4) {
	case 0:
		return 1080, 1350
	case 1:
		return 1080, 720
	case 2:
		return 900, 1200
	default:
		return 1080, 1080
	}
}

func setReaction(exec execFunc, ids map[string]string, handle, entityType string, entityID, score int, when time.Time) error {
	_, err := exec(`INSERT INTO reaction (userId, entityType, entityId, score, createdAt) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(userId, entityType, entityId) DO UPDATE SET score=excluded.score, createdAt=excluded.createdAt`,
		ids[handle], entityType, entityID, score, formatTime(when))
	return err
}

func spreadReactions(exec execFunc, ids map[string]string, entityType string, entityID int, from, to time.Time, chance float64, exclude string, rng *rand.Rand) error {
	span := int64(to.Sub(from))
	if span <= 0 {
		span = int64(time.Hour)
	}
	for _, handle := range memberHandles() {
		if handle == exclude || rng.Float64() >= chance {
			continue
		}
		score := 1
		if rng.Float64() < 0.12 {
			score = -1
		}
		if err := setReaction(exec, ids, handle, entityType, entityID, score, from.Add(time.Duration(rng.Int63n(span)))); err != nil {
			return err
		}
	}
	return nil
}

func insertPosts(exec execFunc, media *mediaSeeder, ids map[string]string, now time.Time, rng *rand.Rand) error {
	commentID := commentIDBase
	for i, post := range showcasePosts {
		postID := postIDBase + i
		authorID := ids[post.Author]
		created := now.Add(-time.Duration(post.AgeHours) * time.Hour)

		urls := make([]string, 0, post.Photos)
		for n := 0; n < post.Photos; n++ {
			w, h := photoSize(rng)
			url, err := media.save(fmt.Sprintf("post:%d:%d", postID, n), authorID, photoImage(rng, w, h))
			if err != nil {
				return err
			}
			urls = append(urls, url)
		}
		privacy := post.Privacy
		if privacy == "" {
			privacy = "public"
		}
		publicID := seedUUID(fmt.Sprintf("post:%d", postID))
		if _, err := exec(`INSERT INTO post (postId, publicId, userId, title, content, privacy, score, commentsCounter, createdAt, updatedAt, imageUrls)
			VALUES (?, ?, ?, '', ?, ?, 0, 0, ?, ?, ?)
			ON CONFLICT(postId) DO UPDATE SET publicId=excluded.publicId, userId=excluded.userId, content=excluded.content,
			  privacy=excluded.privacy, createdAt=excluded.createdAt, updatedAt=excluded.updatedAt, imageUrls=excluded.imageUrls`,
			postID, publicID, authorID, post.Content, privacy, formatTime(created), formatTime(created), jsonURLs(urls)); err != nil {
			return err
		}
		if _, err := exec("DELETE FROM post_selected_follower WHERE postId = ?", postID); err != nil {
			return err
		}
		for _, handle := range post.Selected {
			if _, err := exec("INSERT INTO post_selected_follower (postId, userId) VALUES (?, ?) ON CONFLICT DO NOTHING", postID, ids[handle]); err != nil {
				return err
			}
		}

		for _, c := range post.Comments {
			commentID++
			cAuthor := ids[c.Author]
			cTime := now.Add(-time.Duration(c.AgeHours) * time.Hour)
			var images []string
			if c.Photo {
				url, err := media.save(fmt.Sprintf("comment:%d", commentID), cAuthor, photoImage(rng, 800, 800))
				if err != nil {
					return err
				}
				images = append(images, url)
			}
			if c.SVG {
				images = append(images, svgComment(c.Author))
			}
			if _, err := exec(`INSERT INTO comment (commentId, postId, userId, content, score, createdAt, updatedAt, imageUrls)
				VALUES (?, ?, ?, ?, 0, ?, ?, ?)
				ON CONFLICT(commentId) DO UPDATE SET postId=excluded.postId, userId=excluded.userId, content=excluded.content,
				  createdAt=excluded.createdAt, updatedAt=excluded.updatedAt, imageUrls=excluded.imageUrls`,
				commentID, postID, cAuthor, c.Text, formatTime(cTime), formatTime(cTime), jsonURLs(images)); err != nil {
				return err
			}
			if err := spreadReactions(exec, ids, "comment", commentID, cTime, now, 0.20, c.Author, rng); err != nil {
				return err
			}
		}
		if err := spreadReactions(exec, ids, "post", postID, created, now, 0.38, post.Author, rng); err != nil {
			return err
		}
	}

	for _, idx := range []int{2, 3, 4, 7, 10, 14} {
		if idx < len(showcasePosts) {
			if err := setReaction(exec, ids, "dummyuser", "post", postIDBase+idx, 1, now.Add(-time.Duration(idx)*time.Hour)); err != nil {
				return err
			}
		}
	}
	return nil
}

var storyColors = []string{"#4f46e5", "#db2777", "#0d9488", "#ea580c", "#7c3aed", "#0ea5e9"}

func insertStories(exec execFunc, media *mediaSeeder, ids map[string]string, now time.Time, rng *rand.Rand) error {
	firstLive := map[string]int{}
	for i, s := range showcaseStories {
		storyID := storyIDBase + i
		owner := ids[s.Author]
		created := now.Add(-time.Duration(s.AgeHours) * time.Hour)
		mediaType, mediaURL := "text", ""
		if s.Photo {
			mediaType = "image"
			url, err := media.save(fmt.Sprintf("story:%d", storyID), owner, storyImage(rng))
			if err != nil {
				return err
			}
			mediaURL = url
		}
		if _, err := exec(`INSERT INTO story (storyId, userId, content, mediaUrl, mediaType, backgroundColor, createdAt, expiresAt)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(storyId) DO UPDATE SET userId=excluded.userId, content=excluded.content, mediaUrl=excluded.mediaUrl,
			  mediaType=excluded.mediaType, backgroundColor=excluded.backgroundColor, createdAt=excluded.createdAt, expiresAt=excluded.expiresAt`,
			storyID, owner, s.Text, mediaURL, mediaType, storyColors[i%len(storyColors)],
			formatTime(created), formatTime(created.Add(24*time.Hour))); err != nil {
			return err
		}
		if !s.Archive {
			if _, seen := firstLive[s.Author]; !seen {
				firstLive[s.Author] = storyID
			}
		}
	}
	for _, view := range showcaseStoryViews {
		if storyID, ok := firstLive[view[1]]; ok {
			if _, err := exec(`INSERT INTO storyView (storyId, userId, viewedAt) VALUES (?, ?, datetime('now')) ON CONFLICT DO NOTHING`, storyID, ids[view[0]]); err != nil {
				return err
			}
		}
	}
	for _, reply := range showcaseStoryReplies {
		storyID, ok := firstLive[reply.Target]
		if !ok {
			continue
		}
		if _, err := exec("DELETE FROM storyReply WHERE storyId = ? AND userId = ? AND content = ?", storyID, ids[reply.Author], reply.Text); err != nil {
			return err
		}
		if _, err := exec(`INSERT INTO storyReply (storyId, userId, content, createdAt) VALUES (?, ?, ?, ?)`,
			storyID, ids[reply.Author], reply.Text, formatTime(now.Add(-time.Duration(reply.AgeHours)*time.Hour))); err != nil {
			return err
		}
	}
	return nil
}

func spreadGroupReactions(exec execFunc, ids map[string]string, members []string, entityType string, entityID int, from, to time.Time, rng *rand.Rand) error {
	span := int64(to.Sub(from))
	if span <= 0 {
		span = int64(time.Hour)
	}
	for _, handle := range members {
		if rng.Float64() >= 0.45 {
			continue
		}
		if err := setReaction(exec, ids, handle, entityType, entityID, 1, from.Add(time.Duration(rng.Int63n(span)))); err != nil {
			return err
		}
	}
	return nil
}

func insertGroups(exec execFunc, media *mediaSeeder, ids map[string]string, now time.Time, rng *rand.Rand) error {
	contentID := contentIDBase
	for i, g := range showcaseGroups {
		groupID := groupIDBase + i
		ownerID := ids[g.Owner]
		imageURL := ""
		if g.Image {
			url, err := media.save(fmt.Sprintf("group:%d", groupID), ownerID, groupImage(rng, initialsFor(g.Title, "")))
			if err != nil {
				return err
			}
			imageURL = url
		}
		created := now.Add(-time.Duration(200+i*30) * time.Hour)
		if _, err := exec(`INSERT INTO socialGroup (groupId, ownerId, title, description, createdAt, imageUrl)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(groupId) DO UPDATE SET ownerId=excluded.ownerId, title=excluded.title,
			  description=excluded.description, imageUrl=excluded.imageUrl`,
			groupID, ownerID, g.Title, g.Description, formatTime(created), imageURL); err != nil {
			return err
		}
		if _, err := exec(`INSERT INTO socialGroupMember (groupId, userId, role, joinedAt) VALUES (?, ?, 'owner', ?) ON CONFLICT DO NOTHING`,
			groupID, ownerID, formatTime(created)); err != nil {
			return err
		}
		for _, handle := range g.Members {
			if _, err := exec(`INSERT INTO socialGroupMember (groupId, userId, role, joinedAt) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING`,
				groupID, ids[handle], formatTime(created)); err != nil {
				return err
			}
		}
		for _, handle := range g.Requests {
			if _, err := exec(`INSERT INTO socialGroupRequest (groupId, userId, status, createdAt) VALUES (?, ?, 'pending', datetime('now')) ON CONFLICT(groupId, userId) DO NOTHING`,
				groupID, ids[handle]); err != nil {
				return err
			}
		}
		for _, inv := range showcaseGroupInvitations {
			if inv.Group == g.Title {
				if _, err := exec(`INSERT INTO socialGroupInvitation (groupId, userId, status, createdAt) VALUES (?, ?, 'pending', datetime('now')) ON CONFLICT(groupId, userId) DO NOTHING`,
					groupID, ids[inv.Invitee]); err != nil {
					return err
				}
			}
		}
		members := append([]string{g.Owner}, g.Members...)
		for _, post := range g.Posts {
			contentID++
			postID := contentID
			createdAt := now.Add(-time.Duration(post.AgeHours) * time.Hour)
			mediaURL := ""
			if post.Photo {
				url, err := media.save(fmt.Sprintf("groupcontent:%d", postID), ids[post.Author], photoImage(rng, 1000, 700))
				if err != nil {
					return err
				}
				mediaURL = url
			}
			if _, err := exec(`INSERT INTO groupContent (id, groupId, userId, kind, parentId, title, content, mediaUrl, startsAt, createdAt)
				VALUES (?, ?, ?, 'posts', NULL, '', ?, ?, '', ?)
				ON CONFLICT(id) DO UPDATE SET groupId=excluded.groupId, userId=excluded.userId, content=excluded.content,
				  mediaUrl=excluded.mediaUrl, createdAt=excluded.createdAt`,
				postID, groupID, ids[post.Author], post.Text, mediaURL, formatTime(createdAt)); err != nil {
				return err
			}
			if err := spreadGroupReactions(exec, ids, members, "group_post", postID, createdAt, now, rng); err != nil {
				return err
			}
			for _, c := range post.Comments {
				contentID++
				if _, err := exec(`INSERT INTO groupContent (id, groupId, userId, kind, parentId, title, content, mediaUrl, startsAt, createdAt)
					VALUES (?, ?, ?, 'comments', ?, '', ?, '', '', ?)
					ON CONFLICT(id) DO UPDATE SET groupId=excluded.groupId, userId=excluded.userId, parentId=excluded.parentId,
					  content=excluded.content, createdAt=excluded.createdAt`,
					contentID, groupID, ids[c.Author], postID, c.Text, formatTime(now.Add(-time.Duration(c.AgeHours)*time.Hour))); err != nil {
					return err
				}
			}
		}
		for _, e := range g.Events {
			contentID++
			eventID := contentID
			if _, err := exec(`INSERT INTO groupContent (id, groupId, userId, kind, parentId, title, content, mediaUrl, startsAt, createdAt)
				VALUES (?, ?, ?, 'events', NULL, ?, ?, '', ?, datetime('now'))
				ON CONFLICT(id) DO UPDATE SET groupId=excluded.groupId, userId=excluded.userId, title=excluded.title,
				  content=excluded.content, startsAt=excluded.startsAt`,
				eventID, groupID, ids[e.Author], e.Title, e.Text, now.Add(time.Duration(e.StartsInHours)*time.Hour).Format(time.RFC3339)); err != nil {
				return err
			}
			for _, handle := range e.Going {
				if _, err := exec(`INSERT INTO groupRSVP (eventId, userId, status) VALUES (?, ?, 'going') ON CONFLICT(eventId, userId) DO UPDATE SET status='going'`,
					eventID, ids[handle]); err != nil {
					return err
				}
			}
			for _, handle := range e.NotGoing {
				if _, err := exec(`INSERT INTO groupRSVP (eventId, userId, status) VALUES (?, ?, 'not_going') ON CONFLICT(eventId, userId) DO UPDATE SET status='not_going'`,
					eventID, ids[handle]); err != nil {
					return err
				}
			}
		}
		for _, m := range g.Messages {
			contentID++
			mediaURL := ""
			if m.Photo {
				url, err := media.save(fmt.Sprintf("groupmsg:%d", contentID), ids[m.Author], photoImage(rng, 900, 1200))
				if err != nil {
					return err
				}
				mediaURL = url
			}
			if _, err := exec(`INSERT INTO groupContent (id, groupId, userId, kind, parentId, title, content, mediaUrl, startsAt, createdAt)
				VALUES (?, ?, ?, 'messages', NULL, '', ?, ?, '', ?)
				ON CONFLICT(id) DO UPDATE SET groupId=excluded.groupId, userId=excluded.userId, content=excluded.content,
				  mediaUrl=excluded.mediaUrl, createdAt=excluded.createdAt`,
				contentID, groupID, ids[m.Author], m.Text, mediaURL, formatTime(now.Add(-time.Duration(m.AgeHours)*time.Hour))); err != nil {
				return err
			}
		}
	}
	return nil
}

func distinctAuthors(lines []showcaseLine) []string {
	seen := map[string]bool{}
	var authors []string
	for _, line := range lines {
		if !seen[line.Author] {
			seen[line.Author] = true
			authors = append(authors, line.Author)
		}
	}
	return authors
}

func insertMessages(exec execFunc, media *mediaSeeder, ids map[string]string, now time.Time, rng *rand.Rand) error {
	messageID := messageIDBase
	for _, dm := range showcaseDMs {
		participants := distinctAuthors(dm.Lines)
		if len(participants) < 2 {
			continue
		}
		for _, line := range dm.Lines {
			messageID++
			sender := ids[line.Author]
			recipient := ids[participants[0]]
			if participants[0] == line.Author {
				recipient = ids[participants[1]]
			}
			mediaURL, mediaType := "", ""
			if line.Photo {
				url, err := media.save(fmt.Sprintf("dm:%d", messageID), sender, photoImage(rng, 900, 1200))
				if err != nil {
					return err
				}
				mediaURL, mediaType = url, "image"
			}
			isRead := 1
			if recipient == ids["dummyuser"] && line.AgeHours <= 3 {
				isRead = 0
			}
			if _, err := exec(`INSERT INTO message (messageId, senderId, recipientId, content, isRead, mediaUrl, mediaType, editedAt, createdAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
				ON CONFLICT(messageId) DO UPDATE SET senderId=excluded.senderId, recipientId=excluded.recipientId, content=excluded.content,
				  isRead=excluded.isRead, mediaUrl=excluded.mediaUrl, mediaType=excluded.mediaType, createdAt=excluded.createdAt`,
				messageID, sender, recipient, line.Text, isRead, mediaURL, mediaType, formatTime(now.Add(-time.Duration(line.AgeHours)*time.Hour))); err != nil {
				return err
			}
		}
	}
	return nil
}

func recomputeCounters(exec execFunc) error {
	if _, err := exec(`UPDATE post SET
			score = (SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'post' AND r.entityId = post.postId),
			commentsCounter = (SELECT COUNT(*) FROM comment c WHERE c.postId = post.postId)
		WHERE postId >= ?`, postIDBase); err != nil {
		return err
	}
	if _, err := exec(`UPDATE comment SET score =
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'comment' AND r.entityId = comment.commentId)
		WHERE commentId >= ?`, commentIDBase); err != nil {
		return err
	}
	if _, err := exec(`UPDATE groupContent SET score =
			(SELECT COALESCE(SUM(r.score), 0) FROM reaction r WHERE r.entityType = 'group_post' AND r.entityId = groupContent.id)
		WHERE kind = 'posts' AND id >= ?`, contentIDBase); err != nil {
		return err
	}
	return nil
}

func insertSavedPosts(exec execFunc, ids map[string]string) error {
	for _, idx := range []int{6, 12, 15} {
		if idx >= len(showcasePosts) {
			continue
		}
		if _, err := exec(`INSERT INTO savedPost (userId, postId, createdAt) VALUES (?, ?, datetime('now')) ON CONFLICT DO NOTHING`,
			ids["dummyuser"], postIDBase+idx); err != nil {
			return err
		}
	}
	return nil
}

func insertNotifications(tx *sql.Tx, ids map[string]string, now time.Time) error {
	notifID := notifIDBase
	insert := func(userID, actorID, entityType string, entityID, isRead int, createdAt string) error {
		notifID++
		_, err := tx.Exec(`INSERT INTO notification (notificationId, userId, actorId, entityType, entityId, message, isRead, createdAt)
			VALUES (?, ?, ?, ?, ?, '', ?, ?)
			ON CONFLICT(notificationId) DO UPDATE SET userId=excluded.userId, actorId=excluded.actorId,
			  entityType=excluded.entityType, entityId=excluded.entityId, isRead=excluded.isRead, createdAt=excluded.createdAt`,
			notifID, userID, actorID, entityType, entityID, isRead, createdAt)
		return err
	}

	type commentNotif struct {
		id               int
		actor, createdAt string
	}
	rows, err := tx.Query(`SELECT c.commentId, c.userId, c.createdAt FROM comment c JOIN post p ON p.postId = c.postId
		WHERE p.userId = ? AND c.userId <> ? ORDER BY c.commentId`, ids["dummyuser"], ids["dummyuser"])
	if err != nil {
		return err
	}
	var comments []commentNotif
	for rows.Next() {
		var n commentNotif
		if err := rows.Scan(&n.id, &n.actor, &n.createdAt); err != nil {
			rows.Close()
			return err
		}
		comments = append(comments, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for i, n := range comments {
		isRead := 0
		if i == 0 {
			isRead = 1
		}
		if err := insert(ids["dummyuser"], n.actor, "comment", n.id, isRead, n.createdAt); err != nil {
			return err
		}
	}
	if err := insert(ids["dummyuser"], ids["priyanair"], "follow", 0, 0, formatTime(now.Add(-20*time.Hour))); err != nil {
		return err
	}
	var messageID int
	var senderID, createdAt string
	if err := tx.QueryRow(`SELECT messageId, senderId, createdAt FROM message WHERE recipientId = ? ORDER BY createdAt DESC LIMIT 1`,
		ids["dummyuser"]).Scan(&messageID, &senderID, &createdAt); err == nil {
		if err := insert(ids["dummyuser"], senderID, "message", messageID, 0, createdAt); err != nil {
			return err
		}
	}
	var groupID int
	if err := tx.QueryRow(`SELECT groupId FROM socialGroup WHERE title = 'Home Cooks'`).Scan(&groupID); err == nil {
		if err := insert(ids["dummyuser"], ids["diegof"], "group_invitation", groupID, 0, formatTime(now.Add(-6*time.Hour))); err != nil {
			return err
		}
	}
	return nil
}
