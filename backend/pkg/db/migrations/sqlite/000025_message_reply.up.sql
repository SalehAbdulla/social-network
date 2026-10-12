-- A chat message can name the message it answers, so a reply keeps showing what
-- it replied to after it is sent. 0 means "not a reply"; the parent is resolved
-- by joining the same table, so an edited parent is reflected and a deleted one
-- leaves no dangling quote behind.
ALTER TABLE message ADD COLUMN replyToId INTEGER NOT NULL DEFAULT 0;
-- Group chat messages live in groupContent, so they carry the same pointer.
ALTER TABLE groupContent ADD COLUMN replyToId INTEGER NOT NULL DEFAULT 0;
