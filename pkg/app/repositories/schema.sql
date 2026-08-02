PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS message;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS reaction;
DROP TABLE IF EXISTS comment;
DROP TABLE IF EXISTS post;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS user;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

VACUUM;
PRAGMA foreign_keys = ON;

CREATE TABLE user (
    userId          TEXT PRIMARY KEY,
    nickName        TEXT NOT NULL UNIQUE,
    firstName       TEXT NOT NULL,
    lastName        TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    hashedPassword  TEXT NOT NULL,
    yearOfBirth     INTEGER NOT NULL,
    gender          TEXT CHECK(gender IN ('male', 'female')),
    -- isOnline        INTEGER DEFAULT 0 CHECK(isOnline IN (0, 1)),
    createdAt       TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt       TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE category (
    categoryId      INTEGER PRIMARY KEY AUTOINCREMENT,
    categoryName    TEXT NOT NULL UNIQUE
);

insert into category (categoryName) values ("General");
insert into category (categoryName) values ("Tech");
insert into category (categoryName) values ("Dev");
insert into category (categoryName) values ("Gaming");
insert into category (categoryName) values ("Help");
insert into category (categoryName) values ("Life");
insert into category (categoryName) values ("Sport");
insert into category (categoryName) values ("Misc");

CREATE TABLE post (
    postId           INTEGER PRIMARY KEY AUTOINCREMENT,
    userId           TEXT NOT NULL,
    title            TEXT NOT NULL,
    content          TEXT NOT NULL,
    categoryId       INTEGER NOT NULL,
    score            INTEGER DEFAULT 0,
    commentsCounter  INTEGER DEFAULT 0,
    createdAt        TEXT DEFAULT (CURRENT_TIMESTAMP),
    updatedAt        TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (categoryId) REFERENCES category(categoryId) ON DELETE RESTRICT
);

CREATE TABLE comment (
    commentId   INTEGER PRIMARY KEY AUTOINCREMENT,
    postId      INTEGER NOT NULL,
    userId      TEXT NOT NULL,
    commentText TEXT NOT NULL,
    score       INTEGER DEFAULT 0,                
    createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (postId) REFERENCES post(postId) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE reaction (
    reactionId  INTEGER PRIMARY KEY AUTOINCREMENT,
    userId      TEXT NOT NULL,
    entityType  TEXT NOT NULL CHECK(entityType IN ('post', 'comment')),
    entityId    INTEGER NOT NULL,
    score       INTEGER NOT NULL CHECK(score IN (1, -1)),
    createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    
    UNIQUE(userId, entityType, entityId)
);

CREATE TABLE session (
    sessionToken TEXT PRIMARY KEY,
    userId       TEXT NOT NULL UNIQUE,
    timeStamp    TEXT DEFAULT (CURRENT_TIMESTAMP),
    createdAt    TEXT DEFAULT (CURRENT_TIMESTAMP),
    expiredAt    TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE message (
    messageId   INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId    TEXT NOT NULL,
    recipientId TEXT NOT NULL,
    textMessage TEXT NOT NULL,
    timeStamp   TEXT DEFAULT (CURRENT_TIMESTAMP),
    isRead      INTEGER DEFAULT 0 CHECK(isRead IN (0, 1)),
    FOREIGN KEY (senderId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (recipientId) REFERENCES user(userId) ON DELETE CASCADE
);

CREATE TABLE notification (
    notificationId  INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT NOT NULL,
    actorId         TEXT,
    entityType      TEXT NOT NULL CHECK(entityType IN ('comment', 'message')),
    entityId        INTEGER NOT NULL,
    isRead          INTEGER DEFAULT 0 CHECK(isRead IN (0, 1)),
    createdAt       TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (userId) REFERENCES user(userId) ON DELETE CASCADE,
    FOREIGN KEY (actorId) REFERENCES user(userId) ON DELETE SET NULL
);

CREATE INDEX idx_messages_chat_flow 
ON message (senderId, recipientId, timeStamp DESC);

CREATE INDEX idx_reactions_lookup 
ON reaction (entityType, entityId);

CREATE INDEX idx_posts_category 
ON post (categoryId);

CREATE INDEX idx_post_userId ON post (userId);
CREATE INDEX idx_comment_postId ON comment (postId);
CREATE INDEX idx_comment_userId ON comment (userId);

CREATE INDEX idx_notifications_user 
ON notification (userId, isRead, createdAt DESC);
