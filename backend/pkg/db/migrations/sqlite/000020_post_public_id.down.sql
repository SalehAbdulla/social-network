-- The index has to go before the column: SQLite refuses to drop a column an index uses.
DROP INDEX IF EXISTS post_publicId;
ALTER TABLE post DROP COLUMN publicId;
