CREATE TABLE savedPost (
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    postId INTEGER NOT NULL REFERENCES post(postId) ON DELETE CASCADE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId, postId)
);

CREATE INDEX savedPost_userId_createdAt ON savedPost (userId, createdAt DESC);
