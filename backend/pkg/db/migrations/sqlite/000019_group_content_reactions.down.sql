DROP TRIGGER IF EXISTS socialGroup_reaction_cleanup;
DROP TRIGGER IF EXISTS groupContent_reaction_cleanup;
ALTER TABLE groupContent DROP COLUMN score;
