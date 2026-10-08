CREATE TABLE storyReply (
    replyId INTEGER PRIMARY KEY,
    storyId INTEGER NOT NULL REFERENCES story(storyId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    content TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX storyReply_story ON storyReply (storyId, createdAt);

CREATE INDEX storyReply_userId ON storyReply (userId);
