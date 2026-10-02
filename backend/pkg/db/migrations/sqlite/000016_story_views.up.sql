-- Which accounts have opened which story, so the rings in the stories strip can show
-- what is new to this viewer.
--
-- "Seen" belongs to a viewer rather than to the story: one story has many readers and a
-- single `viewed` column could not answer for all of them. The pair is therefore the
-- primary key, which also makes a second view of the same story one row rather than two —
-- the endpoint behind this table can then be idempotent by asking SQLite to do nothing on
-- conflict.
--
-- `ON DELETE CASCADE` follows the two rows this can point at, the way `savedPost` does:
-- the connection the app opens sets `_foreign_keys=on` (backend/cmd/main.go), so deleting
-- a story or an account takes its views with it instead of leaving ids that the listing
-- query would have to filter out.
CREATE TABLE storyView (
    storyId INTEGER NOT NULL REFERENCES story(storyId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    viewedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (storyId, userId)
);

-- The listing joins on (storyId, userId), which the primary key already answers, but the
-- cascade above deletes by `userId` alone and the primary key starts at `storyId` — so
-- without this, deleting an account scans the whole table to find its views.
CREATE INDEX storyView_userId ON storyView (userId);
