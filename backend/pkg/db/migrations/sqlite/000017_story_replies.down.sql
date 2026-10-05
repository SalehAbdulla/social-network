-- Reverse of 000017_story_replies.up.sql. The two indexes are named before the table they
-- belong to so this is a literal mirror of the up file; SQLite would drop them with the table
-- anyway. The round trip in pkg/db/sqlite/migrations_test.go is what checks the pair leaves
-- the schema as it found it.
DROP INDEX IF EXISTS storyReply_userId;
DROP INDEX IF EXISTS storyReply_story;
DROP TABLE IF EXISTS storyReply;
