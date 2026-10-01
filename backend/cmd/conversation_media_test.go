package main

import (
	"strconv"
	"testing"

	"social-network/backend/pkg/models"
	"social-network/backend/pkg/payload/message"
)

// conversationMedia reads the media tab of one conversation from the viewer's side.
func conversationMedia(t *testing.T, client integrationClient, partnerID string) message.ConversationMediaResponse {
	t.Helper()
	return decoded[message.ConversationMediaResponse](t, client.call("GET", "/api/v1/messages/media?partnerId="+partnerID, nil, 200))
}

// TestConversationMediaIntegration covers the chat's media tab: the thread the message list
// reads, narrowed to the attachments, behind the same rule about who may open the thread.
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
	// A second message with no attachment, so the tab is shown to be a filter rather than a
	// second copy of the thread.
	owner.call("POST", "/api/v1/messages", map[string]any{
		"recipientId": "alex-id", "text": "And a plain one", "mediaUrl": "", "mediaType": "",
	}, 201)

	// The thread carries both; the tab carries one.
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
	// The sender sees the same tile: it is one thread read from two sides.
	if fromSender := conversationMedia(t, owner, "alex-id"); len(fromSender.Media) != 1 {
		t.Fatalf("the sender's own tab must list the attachment: %+v", fromSender.Media)
	}

	// Hiding a message for one side removes it from that side's tab and leaves the other
	// side's alone, which is the rule the thread already follows.
	reader.call("DELETE", "/api/v1/messages/"+strconv.Itoa(withMedia.MessageId)+"?scope=me", nil, 200)
	if hidden := conversationMedia(t, reader, "dummy-id"); len(hidden.Media) != 0 {
		t.Fatalf("a message hidden for this viewer must leave their media tab too: %+v", hidden.Media)
	}
	if still := conversationMedia(t, owner, "alex-id"); len(still.Media) != 1 {
		t.Fatalf("the other side's tab must be unaffected by that: %+v", still.Media)
	}

	// Someone outside the conversation cannot ask for its media, so the tab runs the chat
	// rule rather than making itself a way around it. The owner is made private first,
	// because a public profile is reachable by anyone by design.
	outsider := newIntegrationClient(t, server)
	outsider.call("POST", "/api/v1/auth/register", registerValues("Out", "Sider", "media-outsider@example.com"), 201)
	profile := decoded[models.SocialUser](t, owner.call("GET", "/api/v1/users/me", nil, 200))
	profile.IsPublic = false
	owner.call("PUT", "/api/v1/users/me", profile, 200)
	outsider.call("GET", "/api/v1/messages/media?partnerId=dummy-id", nil, 403)
	// And a request with no partner at all is a bad request rather than every thread the
	// viewer happens to be in.
	reader.call("GET", "/api/v1/messages/media", nil, 400)
}
