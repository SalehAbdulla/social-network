-- A post's public identifier is a UUID.
--
-- `post.postId` stays the table's integer primary key: it is what `comment.postId`,
-- `savedPost.postId`, `post_selected_follower.postId` and the polymorphic
-- `reaction.entityId` already point at, and none of those need to move. What changes is
-- what the outside sees — a share link, the `?post=` a feed modal reflects into the URL,
-- and the API's own `postId` field — which is now this UUID. An incrementing rowid is
-- therefore never exposed, so posts cannot be enumerated by guessing the next number.
ALTER TABLE post ADD COLUMN publicId TEXT NOT NULL DEFAULT '';

-- Backfill the rows that already exist. SQLite has no uuid(), so this is the standard v4
-- expression: sixteen random bytes with the version nibble (`4`) and the variant nibble
-- (one of 8, 9, a, b) set.
UPDATE post SET publicId = (
  lower(
    hex(randomblob(4)) || '-' ||
    hex(randomblob(2)) || '-4' ||
    substr(hex(randomblob(2)), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(hex(randomblob(2)), 2) || '-' ||
    hex(randomblob(6))
  )
) WHERE publicId = '';

-- One public id per post, and the lookup every post read goes through.
CREATE UNIQUE INDEX post_publicId ON post (publicId);
