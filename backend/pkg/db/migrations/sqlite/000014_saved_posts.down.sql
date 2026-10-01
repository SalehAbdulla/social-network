-- Reverse of 000014_saved_posts.up.sql. The index is named before the table it
-- belongs to so this is a literal mirror of the up file; SQLite would drop the
-- index with the table anyway. The round trip in pkg/db/sqlite/migrations_test.go
-- is what checks the pair leaves the schema as it found it.
DROP INDEX IF EXISTS savedPost_userId_createdAt;
DROP TABLE IF EXISTS savedPost;
