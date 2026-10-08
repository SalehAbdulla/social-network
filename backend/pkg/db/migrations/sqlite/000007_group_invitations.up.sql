CREATE TABLE IF NOT EXISTS socialGroupInvitation (
    invitationId INTEGER PRIMARY KEY,
    groupId INTEGER NOT NULL REFERENCES socialGroup(groupId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (groupId, userId)
);

CREATE INDEX IF NOT EXISTS socialGroupInvitation_group_status ON socialGroupInvitation(groupId, status);
