-- Reverse of 000018_story_archive_index.up.sql. The round trip in
-- pkg/db/sqlite/migrations_test.go is what checks the pair leaves the schema as it found it.
DROP INDEX IF EXISTS story_userId_createdAt;
