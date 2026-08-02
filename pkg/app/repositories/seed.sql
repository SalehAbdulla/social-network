-- ============================================================
-- Seed Data: Users, Posts, Comments, Reactions, Messages, Notifications
-- Only runs on first database initialization
-- ============================================================

-- Users (passwords are bcrypt hashes of "Password123!")
INSERT INTO user (userId, nickName, firstName, lastName, email, hashedPassword, yearOfBirth, gender) VALUES
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'AhmedK',   'Ahmed',   'Khalid',   'ahmed@demo.com',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1995, 'male'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'MonaS',    'Mona',    'Saeed',    'mona@demo.com',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1998, 'female'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'TechGuru', 'mohammed',    'Nasser', 'mohammed@demo.com',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1992, 'male'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'SaraDev',  'Sara',    'Mohammed', 'sara@demo.com',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 2000, 'female'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'gamer_x',  'Khalid',  'Ali',      'khalid@demo.com',  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1997, 'male');

-- Posts
INSERT INTO post (postId, userId, title, content, categoryId, score, commentsCounter, createdAt, updatedAt) VALUES
(1,  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Welcome to Real-Time Forum! 🎉', 'Hey everyone! Excited to be part of this community. This is a real-time forum built with Go, WebSockets, and SQLite. Feel free to introduce yourself and start discussions!', 1, 12, 3, '2026-07-20 10:00:00', '2026-07-20 10:00:00'),
(2,  'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Best practices for Go web apps?', 'I''ve been learning Go for a few months and building web APIs. What are some best practices you all follow? I''m particularly interested in project structure and error handling patterns.', 3, 8, 2, '2026-07-20 12:30:00', '2026-07-20 12:30:00'),
(3,  'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'My new gaming PC build 🖥️', 'Just finished building my new rig! Ryzen 7 7800X3D, RTX 4070 Ti, 32GB DDR5. The performance is insane. Any game recommendations to test it out?', 4, 15, 4, '2026-07-21 14:00:00', '2026-07-21 14:00:00'),
(4,  'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Docker vs Podman in 2026', 'We''re evaluating container runtimes for our production environment. Anyone have experience with Podman in production? How does it compare to Docker these days?', 2, 6, 2, '2026-07-21 16:45:00', '2026-07-21 16:45:00'),
(5,  'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'Weekend football match ⚽', 'Anyone up for a football match this Saturday at the park? We need at least 10 people. Let me know if you''re interested!', 7, 10, 3, '2026-07-22 09:00:00', '2026-07-22 09:00:00'),
(6,  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Need help with SQLite optimization', 'My SQLite queries are getting slow with large datasets. Currently have around 100K rows and some JOIN queries take 500ms+. Any tips on indexing strategies or query optimization?', 5, 4, 1, '2026-07-22 11:00:00', '2026-07-22 11:00:00'),
(7,  'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Share your dev setup! 💻', 'Curious to see what everyone''s development environment looks like. I use VS Code with the Catppuccin theme on Arch Linux (btw). What about you?', 3, 9, 3, '2026-07-23 08:30:00', '2026-07-23 08:30:00'),
(8,  'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Healthy lifestyle tips 🌱', 'Been trying to improve my daily routine. Started morning walks, drinking more water, and meal prepping. What healthy habits have you adopted that made a difference?', 6, 7, 2, '2026-07-23 15:00:00', '2026-07-23 15:00:00'),
(9,  'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Awesome open-source projects to contribute to?', 'Looking for beginner-friendly open-source Go projects on GitHub. Preferably something with good documentation and an active community. Any recommendations?', 3, 5, 2, '2026-07-21 09:00:00', '2026-07-21 09:00:00'),
(10, 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Tips for remote work productivity?', 'I''ve been working remotely for a year now and sometimes struggle with focus. What tools or techniques do you use to stay productive working from home?', 5, 4, 1, '2026-07-22 08:00:00', '2026-07-22 08:00:00'),
(11, 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'What games are you playing right now?', 'Currently grinding Valorant and sometimes CS2. Looking for new multiplayer games to try with friends. What''s everyone playing these days?', 4, 3, 1, '2026-07-23 18:00:00', '2026-07-23 18:00:00'),
(12, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'REST vs GraphQL — which do you prefer?', 'Been building APIs with REST for years but GraphQL seems promising for complex data fetching. What are your experiences with both? When would you choose one over the other?', 2, 6, 2, '2026-07-22 15:00:00', '2026-07-22 15:00:00'),
(13, 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Favorite coding music? 🎵', 'I can''t code without music. My go-to is lo-fi hip hop or Hans Zimmer soundtracks. What do you all listen to while coding?', 6, 4, 1, '2026-07-23 12:00:00', '2026-07-23 12:00:00'),
(14, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'AI tools for developers in 2026', 'GitHub Copilot, Cursor, ChatGPT — AI is changing how we code. What AI tools do you actually use daily and find productive? Any you tried and abandoned?', 2, 8, 3, '2026-07-24 07:00:00', '2026-07-24 07:00:00'),
(15, 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Learning a second language?', 'Just started learning Spanish on Duolingo! Any tips for staying consistent? How do you practice speaking when there''s no one to talk to?', 6, 2, 1, '2026-07-24 10:00:00', '2026-07-24 10:00:00');

-- Comments
INSERT INTO comment (commentId, postId, userId, commentText, score, createdAt) VALUES
(1,  1, 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Welcome! Great to see this community growing.', 5, '2026-07-20 10:30:00'),
(2,  1, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'The tech stack looks solid! Go + WebSockets is a great combo.', 3, '2026-07-20 11:00:00'),
(3,  1, 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Would love to see a dark mode option!', 2, '2026-07-20 11:45:00'),
(4,  2, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Always use interfaces for your services — makes testing way easier.', 8, '2026-07-20 13:00:00'),
(5,  2, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Check out the standard project layout: cmd/, pkg/, internal/. Clean separation is key.', 6, '2026-07-20 13:30:00'),
(6,  3, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Try Cyberpunk 2077 with path tracing — looks incredible on that GPU!', 4, '2026-07-21 14:30:00'),
(7,  3, 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Elden Ring is a must-play. The DLC is coming soon too!', 7, '2026-07-21 15:00:00'),
(8,  3, 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Sweet build! What case did you go with?', 2, '2026-07-21 15:45:00'),
(9,  3, 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'Baldur''s Gate 3 if you like RPGs. 100+ hours of content!', 5, '2026-07-21 16:00:00'),
(10, 4, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Podman''s rootless containers are a big win for security. We switched last year.', 4, '2026-07-21 17:15:00'),
(11, 4, 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'Docker still has better ecosystem support IMO. But Podman is catching up fast.', 3, '2026-07-21 18:00:00'),
(12, 5, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Count me in! What time on Saturday?', 2, '2026-07-22 09:30:00'),
(13, 5, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'I''ll bring the ball!', 4, '2026-07-22 10:00:00'),
(14, 5, 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Can I bring a friend? He plays too.', 1, '2026-07-22 10:30:00'),
(15, 6, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Make sure you have indexes on the columns in your WHERE and JOIN clauses. Also try EXPLAIN QUERY PLAN.', 3, '2026-07-22 11:30:00'),
(16, 7, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'VS Code + Dracula theme on macOS. Simple and effective!', 5, '2026-07-23 09:00:00'),
(17, 7, 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Neovim btw. Once you go terminal, you never go back.', 8, '2026-07-23 09:30:00'),
(18, 7, 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'IntelliJ with Material Theme. The Go plugin is amazing.', 2, '2026-07-23 10:00:00'),
(19, 8, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Meditation has been a game changer for me. 10 minutes every morning.', 4, '2026-07-23 15:30:00'),
(20, 8, 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'No screen time 1 hour before bed. Improved my sleep quality significantly.', 3, '2026-07-23 16:00:00');

-- Reactions (likes/dislikes on posts and comments)
INSERT INTO reaction (userId, entityType, entityId, score, createdAt) VALUES
-- Post reactions
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 2, 1,  '2026-07-20 13:00:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 3, 1,  '2026-07-21 14:30:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 4, 1,  '2026-07-21 17:00:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 5, 1,  '2026-07-22 10:00:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 7, 1,  '2026-07-23 09:30:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'post', 8, 1,  '2026-07-23 16:00:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'post', 1, 1,  '2026-07-20 10:30:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'post', 3, 1,  '2026-07-21 15:00:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'post', 5, 1,  '2026-07-22 09:30:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'post', 7, 1,  '2026-07-23 10:00:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'post', 1, 1,  '2026-07-20 11:00:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'post', 2, 1,  '2026-07-20 14:00:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'post', 4, -1, '2026-07-21 18:00:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'post', 8, 1,  '2026-07-23 17:00:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'post', 1, 1,  '2026-07-20 12:00:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'post', 3, 1,  '2026-07-21 16:00:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'post', 7, -1, '2026-07-23 10:30:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'post', 1, 1,  '2026-07-20 10:15:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'post', 3, 1,  '2026-07-21 14:15:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'post', 7, 1,  '2026-07-23 08:45:00'),
-- Comment reactions
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 4, 1,  '2026-07-20 13:15:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 7, 1,  '2026-07-21 15:15:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 10, 1, '2026-07-21 17:30:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'comment', 2, 1,  '2026-07-20 11:15:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'comment', 6, 1,  '2026-07-21 14:45:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'comment', 16, 1, '2026-07-23 09:15:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 1, 1,  '2026-07-20 10:45:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 5, -1, '2026-07-20 13:45:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 19, 1, '2026-07-23 15:45:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 3, 1,  '2026-07-20 12:00:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 9, 1,  '2026-07-21 16:15:00'),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 20, 1, '2026-07-23 16:15:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'comment', 8, 1,  '2026-07-21 16:00:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'comment', 17, 1, '2026-07-23 09:45:00');

-- Messages (private chats between users)
INSERT INTO message (senderId, recipientId, textMessage, timeStamp, isRead) VALUES
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Hey Mona! Loved your post about Go best practices.', '2026-07-20 14:00:00', 1),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Thanks Ahmed! Always happy to share knowledge.', '2026-07-20 14:05:00', 1),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Have you tried the new Go 1.25 features?', '2026-07-20 14:10:00', 1),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Not yet! I should definitely check them out.', '2026-07-20 14:15:00', 0),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'Bro, did you see the new GPU benchmarks?', '2026-07-21 18:00:00', 1),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Yeah man! The 5000 series is looking insane. Might upgrade next month.', '2026-07-21 18:05:00', 1),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'Let me know if you need help with the build!', '2026-07-21 18:10:00', 1),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'Definitely, I might take you up on that!', '2026-07-21 18:15:00', 0),
('d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Hi Mona! Love your healthy lifestyle post. Any tips for beginners?', '2026-07-23 16:30:00', 1),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'Start small! Even a 15-minute walk daily makes a huge difference.', '2026-07-23 16:35:00', 0);

-- Notifications
INSERT INTO notification (userId, actorId, entityType, entityId, isRead, createdAt) VALUES
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'comment', 1, 1, '2026-07-20 10:30:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 2, 1, '2026-07-20 11:00:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 3, 0, '2026-07-20 11:45:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'message', 1, 1, '2026-07-20 14:00:00'),
('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 15, 0, '2026-07-22 11:30:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 4, 1, '2026-07-20 13:00:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 5, 0, '2026-07-20 13:30:00'),
('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'message', 9, 0, '2026-07-23 16:30:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 6, 1, '2026-07-21 14:30:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'comment', 7, 0, '2026-07-21 15:00:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 8, 0, '2026-07-21 15:45:00'),
('c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'comment', 9, 0, '2026-07-21 16:00:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'comment', 12, 0, '2026-07-22 09:30:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f', 'comment', 13, 0, '2026-07-22 10:00:00'),
('e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', 'comment', 14, 0, '2026-07-22 10:30:00');