CREATE TABLE post_selected_follower (
    postId INTEGER NOT NULL REFERENCES post(postId) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES user(userId) ON DELETE CASCADE,
    PRIMARY KEY (postId, userId)
);
CREATE INDEX post_selected_follower_user ON post_selected_follower(userId, postId);
