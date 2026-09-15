ALTER TABLE user ADD COLUMN birthDate TEXT NOT NULL DEFAULT '';
UPDATE user SET birthDate = printf('%04d-01-01', birthYear) WHERE birthDate = '';