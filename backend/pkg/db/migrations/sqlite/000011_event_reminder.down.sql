-- The column is not indexed and no view or trigger mentions it, so SQLite can
-- drop it in place.
ALTER TABLE groupContent DROP COLUMN reminderSentAt;
