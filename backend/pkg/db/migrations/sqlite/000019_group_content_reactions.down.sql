-- Reverse of 000019_group_content_reactions.up.sql: both cleanup rules go away, then the
-- column. The round trip in pkg/db/sqlite/migrations_test.go is what checks the pair leaves
-- the schema as it found it.
DROP TRIGGER IF EXISTS socialGroup_reaction_cleanup;
DROP TRIGGER IF EXISTS groupContent_reaction_cleanup;
-- Neither trigger that remains nor the feed index mentions the column, so SQLite can drop it
-- in place.
ALTER TABLE groupContent DROP COLUMN score;
