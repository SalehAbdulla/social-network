package tests

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
)

func conversationMedia(t *testing.T, client integrationClient, partnerID string) message.ConversationMediaResponse {
	t.Helper()
	return decoded[message.ConversationMediaResponse](t, client.call("GET", "/api/v1/messages/media?partnerId="+partnerID, nil, 200))
}

func TestConversationMediaIntegration(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	owner, reader := newIntegrationClient(t, server), newIntegrationClient(t, server)
	owner.login("dummy@example.com")
	reader.login("alex@example.com")

	mediaID := "123e4567-e89b-12d3-a456-426614174501"
	addOwnedMedia(t, repo, "dummy-id", mediaID)
	imageURL := "/api/v1/media/" + mediaID
	withMedia := decoded[message.MessageDTO](t, owner.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "Look at this", "mediaUrl": imageURL, "mediaType": "image",
	}, 201))
	owner.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "And a plain one", "mediaUrl": "", "mediaType": "",
	}, 201)

	if thread := messagesBetween(t, reader, "dummy-id").Messages; len(thread) != 2 {
		t.Fatalf("the thread should hold both messages: %+v", thread)
	}
	tab := conversationMedia(t, reader, "dummy-id")
	if len(tab.Media) != 1 || tab.Media[0].MediaURL != imageURL || tab.Media[0].MediaType != "image" || tab.TotalElements != 1 {
		t.Fatalf("the media tab must list the attachment and nothing else: %+v", tab)
	}
	if tab.Media[0].MessageId != withMedia.MessageId {
		t.Fatalf("the tile must name the message it came from: %+v", tab.Media[0])
	}
	if fromSender := conversationMedia(t, owner, "alex-id"); len(fromSender.Media) != 1 {
		t.Fatalf("the sender's own tab must list the attachment: %+v", fromSender.Media)
	}

	reader.call("DELETE", "/api/v1/messages/"+strconv.Itoa(withMedia.MessageId)+"?scope=me", nil, 200)
	if hidden := conversationMedia(t, reader, "dummy-id"); len(hidden.Media) != 0 {
		t.Fatalf("a message hidden for this viewer must leave their media tab too: %+v", hidden.Media)
	}
	if still := conversationMedia(t, owner, "alex-id"); len(still.Media) != 1 {
		t.Fatalf("the other side's tab must be unaffected by that: %+v", still.Media)
	}

	outsider := newIntegrationClient(t, server)
	outsider.call("POST", "/api/v1/auth/register", registerValues("Out", "Sider", "media-outsider@example.com"), 201)
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	outsider.call("GET", "/api/v1/messages/media?partnerId=dummy-id", nil, 403)
	reader.call("GET", "/api/v1/messages/media", nil, 400)
}
