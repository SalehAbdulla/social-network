-- Password reset tokens (000012). The token itself is never stored: the row holds
-- a sha256 of it, so a leaked database does not hand over working reset links.
-- Consuming a row is a single claim-once UPDATE (usedAt IS NULL), which is why a
-- confirm that arrives twice cannot apply twice, and `usedAt` is kept rather than
-- the row being deleted so a replay can be recognized as a replay.
--
-- One live token per account is the service's job, not a constraint here: it
-- deletes the account's older rows when it issues a new one. A partial unique
-- index on userId WHERE usedAt IS NULL would say the same thing in SQL, but the
-- behaviour would then depend on a feature of the database rather than on the
-- code path that also has to send the mail.
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
