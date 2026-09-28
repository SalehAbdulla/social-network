-- A comment can carry an image or GIF, mirroring post.imageUrls from 000002.
-- The column is a JSON array so one comment can hold a small gallery.
ALTER TABLE comment ADD COLUMN imageUrls TEXT NOT NULL DEFAULT '[]';

-- The profile media tab reads a user's comment photos by author, newest first.
CREATE INDEX IF NOT EXISTS comment_userId ON comment(userId);
