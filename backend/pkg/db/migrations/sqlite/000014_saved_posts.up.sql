-- Bookmarks: a private list of posts one account has saved.
--
-- The pair is the primary key, so saving the same post twice is one row rather
-- than two, and the write uses `ON CONFLICT DO NOTHING` so the endpoint is
-- idempotent instead of erroring the second time. `ON DELETE CASCADE` follows
-- the two rows this can point at: the connection the app opens sets
-- `_foreign_keys=on` (backend/cmd/main.go), so deleting a post or an account
-- takes its saved rows with it rather than leaving dangling ids that the list
-- query would have to filter out.
CREATE TABLE savedPost (
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    postId INTEGER NOT NULL REFERENCES post(postId) ON DELETE CASCADE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId, postId)
);

-- One account's saved list, newest first. The primary key starts at userId, so
-- it can find the rows, but not in `createdAt` order: without this the list
-- sorts a temporary b-tree on every page load.
CREATE INDEX savedPost_userId_createdAt ON savedPost (userId, createdAt DESC);
