CREATE TABLE socialGroup (
    groupId INTEGER PRIMARY KEY,
    ownerId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE socialGroupMember (
    groupId INTEGER NOT NULL REFERENCES socialGroup(groupId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joinedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (groupId, userId)
);

CREATE TABLE socialGroupRequest (
    requestId INTEGER PRIMARY KEY,
    groupId INTEGER NOT NULL REFERENCES socialGroup(groupId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (groupId, userId)
);

CREATE TABLE socialGroupInvitation (
    invitationId INTEGER PRIMARY KEY,
    groupId INTEGER NOT NULL REFERENCES socialGroup(groupId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (groupId, userId)
);

CREATE INDEX socialGroup_owner ON socialGroup(ownerId);
CREATE INDEX socialGroupRequest_group_status ON socialGroupRequest(groupId, status);
CREATE INDEX socialGroupInvitation_group_status ON socialGroupInvitation(groupId, status);