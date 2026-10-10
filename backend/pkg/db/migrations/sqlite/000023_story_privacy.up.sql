ALTER TABLE story ADD COLUMN privacy TEXT NOT NULL DEFAULT 'public';
CREATE TABLE story_selected_follower (
    storyId INTEGER NOT NULL REFERENCES story(storyId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    PRIMARY KEY (storyId, userId)
);
CREATE INDEX story_selected_follower_user ON story_selected_follower(userId, storyId);
