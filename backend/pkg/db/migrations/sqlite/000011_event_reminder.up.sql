-- Group events get a one-shot reminder before they start, and the row that was
-- reminded records it. A stamp on the event rather than a row per attendee
-- because one pass notifies everybody who is going: the stamp is what makes a
-- second sweep a no-op instead of a second notification.
ALTER TABLE groupContent ADD COLUMN reminderSentAt TEXT NOT NULL DEFAULT '';
