ALTER TABLE post ADD COLUMN publicId TEXT NOT NULL DEFAULT '';

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

CREATE UNIQUE INDEX post_publicId ON post (publicId);
