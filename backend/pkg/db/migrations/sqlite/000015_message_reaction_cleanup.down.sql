-- Reverse of 000015_message_reaction_cleanup.up.sql: the trigger goes away with the rule
-- it enforces, so the round trip in pkg/db/sqlite/migrations_test.go leaves the schema as
-- it found it.
DROP TRIGGER IF EXISTS message_reaction_cleanup;
