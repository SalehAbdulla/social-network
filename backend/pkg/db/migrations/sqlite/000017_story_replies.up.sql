-- A reply to a story: text an account leaves on a live story that its author, and only its
-- author, reads back.
--
-- It is a table of its own rather than a `message` row for the reason the seen-by list is
-- (`storyView`): a reply is read in the story view by the story's author alone, so it is not a
-- conversation and must not open a private thread. The `CanMessage` rule still gates the
-- write (see SocialService.ReplyToStory), because a reply is private text addressed to one
-- account and the spec's chat rule is what decides who may address whom.
--
-- `ON DELETE CASCADE` follows both rows this points at, the way `storyView` does: the
-- connection the app opens sets `_foreign_keys=on` (backend/cmd/main.go), so deleting a story
-- or an account takes its replies with it instead of leaving ids the read would have to filter
-- out by hand.
CREATE TABLE storyReply (
    replyId INTEGER PRIMARY KEY,
    storyId INTEGER NOT NULL REFERENCES story(storyId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    content TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The read walks one story's replies newest first, which this index answers directly.
CREATE INDEX storyReply_story ON storyReply (storyId, createdAt);

-- The cascade above deletes by `userId` alone while the index above starts at `storyId`, so
-- without this, deleting an account would scan the whole table to find its replies.
CREATE INDEX storyReply_userId ON storyReply (userId);
