ALTER TABLE groupContent ADD COLUMN score INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER groupContent_reaction_cleanup AFTER DELETE ON groupContent BEGIN
    DELETE FROM reaction WHERE entityType IN ('group_post', 'group_comment') AND entityId = OLD.id;
END;

CREATE TRIGGER socialGroup_reaction_cleanup BEFORE DELETE ON socialGroup BEGIN
    DELETE FROM reaction
    WHERE entityType IN ('group_post', 'group_comment')
      AND entityId IN (SELECT id FROM groupContent WHERE groupId = OLD.groupId);
END;
