-- The story archive lists one account's expired stories, newest first — a query shape the table
-- did not have. `story_expiry` (000002) serves the live listing's `expiresAt > now` filter, and
-- nothing indexed `userId`, so the archive would sort a temporary b-tree on every page load.
-- This is the same index, for the same reason, that 000014 gave the saved-post list.
CREATE INDEX story_userId_createdAt ON story (userId, createdAt DESC);
