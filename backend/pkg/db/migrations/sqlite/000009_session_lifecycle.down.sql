-- Restore the original three-column session table from 000001.
CREATE TABLE IF NOT EXISTS session_replacement (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

INSERT OR IGNORE INTO session_replacement (token, userId, expiresAt)
    SELECT token, userId, expiresAt FROM session;

DROP TABLE session;
ALTER TABLE session_replacement RENAME TO session;
