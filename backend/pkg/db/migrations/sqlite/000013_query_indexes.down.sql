-- Reverse of 000013_query_indexes.up.sql. Each index is dropped by name, in the reverse of
-- the order it was created, so the migration round trip in pkg/db/sqlite/migrations_test.go
-- leaves the schema exactly as it found it.
DROP INDEX IF EXISTS reaction_entityType_entityId;
DROP INDEX IF EXISTS notification_userId_isRead;
DROP INDEX IF EXISTS comment_postId_createdAt;
DROP INDEX IF EXISTS post_userId_createdAt;
DROP INDEX IF EXISTS post_createdAt;
DROP INDEX IF EXISTS connection_recipient_status;
