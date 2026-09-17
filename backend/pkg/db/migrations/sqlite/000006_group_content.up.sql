CREATE TABLE groupContent (
 id INTEGER PRIMARY KEY,
 groupId INTEGER NOT NULL REFERENCES socialGroup(groupId) ON DELETE CASCADE,
 userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('posts','comments','events','messages')),
 parentId INTEGER REFERENCES groupContent(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT '',
 content TEXT NOT NULL,
 mediaUrl TEXT NOT NULL DEFAULT '',
 startsAt TEXT NOT NULL DEFAULT '',
 createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX groupContent_feed ON groupContent(groupId,kind,parentId,id);
CREATE TABLE groupRSVP (
 eventId INTEGER NOT NULL REFERENCES groupContent(id) ON DELETE CASCADE,
 userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('going','not_going')),
 PRIMARY KEY(eventId,userId)
);
