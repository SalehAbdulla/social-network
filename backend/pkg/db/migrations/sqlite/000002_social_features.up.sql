ALTER TABLE user ADD COLUMN coverPhoto TEXT NOT NULL DEFAULT '';
ALTER TABLE user ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE post ADD COLUMN imageUrls TEXT NOT NULL DEFAULT '[]';
ALTER TABLE message ADD COLUMN mediaUrl TEXT NOT NULL DEFAULT '';
ALTER TABLE message ADD COLUMN mediaType TEXT NOT NULL DEFAULT '';
ALTER TABLE message ADD COLUMN editedAt TEXT NOT NULL DEFAULT '';

CREATE TABLE follow (
    followerId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    followedId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    PRIMARY KEY (followerId, followedId),
    CHECK (followerId != followedId)
);
CREATE TABLE connection (
    requesterId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    recipientId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (requesterId, recipientId),
    CHECK (requesterId != recipientId)
);
CREATE UNIQUE INDEX connection_pair ON connection (MIN(requesterId, recipientId), MAX(requesterId, recipientId));

CREATE TABLE media (
    mediaId TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    contentType TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE story (
    storyId INTEGER PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    mediaUrl TEXT NOT NULL DEFAULT '',
    mediaType TEXT NOT NULL DEFAULT 'text' CHECK (mediaType IN ('text', 'image', 'video')),
    backgroundColor TEXT NOT NULL DEFAULT '#4f46e5',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME NOT NULL DEFAULT (datetime('now', '+24 hours'))
);
CREATE TABLE hidden_message (
    messageId INTEGER NOT NULL REFERENCES message(messageId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    PRIMARY KEY (messageId, userId)
);
CREATE INDEX story_expiry ON story(expiresAt);
CREATE INDEX message_conversation ON message(senderId, recipientId, createdAt);
CREATE INDEX follow_target ON follow(followedId);

CREATE TRIGGER post_cleanup AFTER DELETE ON post BEGIN
    DELETE FROM reaction WHERE entityType = 'comment' AND entityId IN (SELECT commentId FROM comment WHERE postId = OLD.postId);
    DELETE FROM notification WHERE entityType = 'comment' AND entityId IN (SELECT commentId FROM comment WHERE postId = OLD.postId);
    DELETE FROM comment WHERE postId = OLD.postId;
    DELETE FROM reaction WHERE entityType = 'post' AND entityId = OLD.postId;
END;
CREATE TRIGGER comment_cleanup AFTER DELETE ON comment BEGIN
    DELETE FROM reaction WHERE entityType = 'comment' AND entityId = OLD.commentId;
    DELETE FROM notification WHERE entityType = 'comment' AND entityId = OLD.commentId;
END;
CREATE TRIGGER message_cleanup AFTER DELETE ON message BEGIN
    DELETE FROM hidden_message WHERE messageId = OLD.messageId;
    DELETE FROM notification WHERE entityType = 'message' AND entityId = OLD.messageId;
END;
