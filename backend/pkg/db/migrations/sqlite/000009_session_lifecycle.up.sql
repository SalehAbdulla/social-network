-- Sessions move from process memory to the database so a backend restart no
-- longer signs every user out. The table is rebuilt rather than altered because
-- SQLite cannot add a column with a CURRENT_TIMESTAMP default.
CREATE TABLE IF NOT EXISTS session_replacement (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

INSERT OR IGNORE INTO session_replacement (token, userId, expiresAt, createdAt, lastSeenAt)
    SELECT token, userId, expiresAt, datetime('now'), datetime('now') FROM session;

DROP TABLE session;
ALTER TABLE session_replacement RENAME TO session;

CREATE INDEX IF NOT EXISTS session_userId ON session(userId);
CREATE INDEX IF NOT EXISTS session_expiresAt ON session(expiresAt);
