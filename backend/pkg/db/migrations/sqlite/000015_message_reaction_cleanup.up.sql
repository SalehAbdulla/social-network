-- Reactions on a chat message are cleaned up when the message goes.
--
-- `000002` gives comments and messages cleanup triggers: a deleted comment takes its
-- reactions and notifications with it, and a deleted message takes its hidden copies and
-- its notifications. Reactions on a *message* were missing from that list because nothing
-- could react to a message yet. Now that something can, the same rule has to apply — and it
-- has to be a trigger rather than a foreign key, because `reaction.entityId` is shared by
-- posts, comments and messages and so cannot reference one table.
CREATE TRIGGER message_reaction_cleanup AFTER DELETE ON message BEGIN
    DELETE FROM reaction WHERE entityType = 'message' AND entityId = OLD.messageId;
END;
