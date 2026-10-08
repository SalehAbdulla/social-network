CREATE TABLE IF NOT EXISTS passwordReset (
    resetId TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    expiresAt DATETIME NOT NULL,
    usedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS passwordReset_userId ON passwordReset(userId);
CREATE INDEX IF NOT EXISTS passwordReset_expiresAt ON passwordReset(expiresAt);
