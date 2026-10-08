ALTER TABLE comment ADD COLUMN imageUrls TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS comment_userId ON comment(userId);
