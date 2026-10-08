CREATE TRIGGER message_reaction_cleanup AFTER DELETE ON message BEGIN
    DELETE FROM reaction WHERE entityType = 'message' AND entityId = OLD.messageId;
END;
