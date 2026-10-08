CREATE INDEX IF NOT EXISTS connection_recipient_status ON connection (recipientId, status, createdAt DESC, requesterId);

CREATE INDEX IF NOT EXISTS post_createdAt ON post (createdAt);

CREATE INDEX IF NOT EXISTS post_userId_createdAt ON post (userId, createdAt, postId);

CREATE INDEX IF NOT EXISTS comment_postId_createdAt ON comment (postId, createdAt);

CREATE INDEX IF NOT EXISTS notification_userId_isRead ON notification (userId, isRead);

CREATE INDEX IF NOT EXISTS reaction_entityType_entityId ON reaction (entityType, entityId);
