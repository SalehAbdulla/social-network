-- Indexes for the read paths that a plan review found scanning.
--
-- Every index here exists because `EXPLAIN QUERY PLAN` showed SQLite scanning the whole
-- table for a query the app runs, and the reason is recorded next to it rather than in a
-- commit message nobody will read. `pkg/app/repositories/query_plan_test.go` asserts the
-- plan each one is responsible for, and drops and recreates them to measure what the
-- query costs without them, so this file and the evidence can only move together.
--
-- The measurements quoted below come from that test's fixture (3 000 posts, 3 000
-- comments, 9 000 reactions, 3 000 notifications, 800 follow requests, 900 accounts),
-- median of five runs, on the schema as it stands without ANALYZE — the app never runs
-- ANALYZE, so the estimates SQLite plans from are the ones production sees. They move by
-- ten or twenty per cent between runs on a laptop, so read them as orders of magnitude
-- rather than as benchmarks; the plans they accompany are the stable part.

-- One account's pending follow requests, newest first. `connection`'s primary key is
-- (requesterId, recipientId), so a query filtering by recipientId could not use it: the
-- plan scanned the table and then sorted it (800 rows: ~22 µs, SCAN + TEMP B-TREE). With
-- this index it is a covering search on (recipientId, status) with the order already
-- satisfied — covering because requesterId and createdAt are both read by the SELECT, and
-- the explicit DESC is what removes the last sort term (~9 µs, no temporary b-tree).
CREATE INDEX IF NOT EXISTS connection_recipient_status ON connection (recipientId, status, createdAt DESC, requesterId);

-- The feed's page, ordered newest first with a LIMIT. No index on `post` existed at all,
-- so every page read every post in the database, evaluated the visibility fragment per row
-- and sorted the result (3 000 rows: ~800 µs, SCAN + TEMP B-TREE). This index lets the
-- planner walk posts in the order the query asks for and stop once the page is full
-- (~36 µs, no temporary b-tree).
CREATE INDEX IF NOT EXISTS post_createdAt ON post (createdAt);

-- One author's posts, which is the profile page, its media tab and the likes tab. It is
-- not optional alongside the index above: with only `post_createdAt` the planner prefers
-- it for this query too and walks all 3 000 index entries to find one author's posts,
-- which measured *slower* than the scan it replaced (~310 µs against ~60 µs). With both,
-- this one is chosen (~17 µs; the likes tab, which searches the same way, is unchanged
-- within noise at ~19 µs), so the two are one decision, made from that comparison.
CREATE INDEX IF NOT EXISTS post_userId_createdAt ON post (userId, createdAt, postId);

-- One post's comments: the count and the page. `comment` had an index on userId only
-- (000010), so both queries scanned every comment in the database (count 38 µs as a
-- covering scan, page 52 µs with a sort of the whole table). This index answers the count
-- from the index alone (5 µs) and gives the page its rows in the order it wants them
-- (17 µs, no temporary b-tree).
CREATE INDEX IF NOT EXISTS comment_postId_createdAt ON comment (postId, createdAt);

-- The unread badge, which the sidebar polls every 15 seconds in every open tab, and the
-- notifications page. `notification` had no index at all: each poll counted every row in
-- the table and each page load scanned and sorted it (count ~90 µs, page ~106 µs). The two
-- equalities of the count are the leading columns here; the page scans only that account's
-- rows (~7 µs and ~22 µs). `(userId, createdAt)` was measured too and came out
-- indistinguishable for both, so the smaller index was taken.
CREATE INDEX IF NOT EXISTS notification_userId_isRead ON notification (userId, isRead);

-- A post's or a comment's total score, used when one entity is displayed. The unique index
-- on `reaction` starts at userId, so it cannot serve an entityId lookup: the plan summed
-- the whole table (9 000 rows: ~190 µs). With this index it reads only that entity's rows
-- (~6 µs). Ordered entityType first because every lookup names a type.
CREATE INDEX IF NOT EXISTS reaction_entityType_entityId ON reaction (entityType, entityId);
