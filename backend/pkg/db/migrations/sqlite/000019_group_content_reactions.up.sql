-- Likes on group content.
--
-- `reaction` is already polymorphic — it keys on (entityType, entityId) and deliberately has
-- no foreign key, which is what let 000015 add message reactions without touching the table.
-- Group content needs no schema change either: two new target types, `group_post` and
-- `group_comment`, are all the reaction table has to know. What it does need is the
-- denormalised total, so a page of the group's posts or comments can read its like count
-- from the row it is already selecting rather than aggregating the reaction table per item.
ALTER TABLE groupContent ADD COLUMN score INTEGER NOT NULL DEFAULT 0;

-- A deleted group post or comment takes its reactions with it. It is a trigger rather than a
-- foreign key for the reason recorded in 000015: `reaction.entityId` is shared by every target
-- type, so it cannot reference one table.
CREATE TRIGGER groupContent_reaction_cleanup AFTER DELETE ON groupContent BEGIN
    DELETE FROM reaction WHERE entityType IN ('group_post', 'group_comment') AND entityId = OLD.id;
END;

-- Deleting a group removes its content by cascade, and SQLite does not fire a table's DELETE
-- triggers for rows removed by a foreign-key action, so the trigger above would never see
-- them. This one runs on the parent before the cascade, while the content rows are still
-- there, and is what keeps a deleted group from leaving its likes behind.
CREATE TRIGGER socialGroup_reaction_cleanup BEFORE DELETE ON socialGroup BEGIN
    DELETE FROM reaction
    WHERE entityType IN ('group_post', 'group_comment')
      AND entityId IN (SELECT id FROM groupContent WHERE groupId = OLD.groupId);
END;
