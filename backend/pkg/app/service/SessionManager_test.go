package service

import (
 "testing"
 "time"
)

func TestExpiredSessionIsRevoked(t *testing.T) {
 sm:=NewSessionManager();sm.CreateSession("user","expired")
 sm.Expires["expired"]=time.Now().Add(-time.Second)
 if _,ok:=sm.GetUserIdByToken("expired");ok{t.Fatal("expired token accepted")}
 if len(sm.TokenToUID)!=0||len(sm.UIDToToken)!=0||len(sm.Presence)!=0||len(sm.Expires)!=0{t.Fatal("expired session state retained")}
}

func TestSessionManagerCreateSessionEvictsPreviousToken(t *testing.T) {
	sm := NewSessionManager()
	userIDt := "123e4567-e89b-12d3-a456-426614174000"

	sm.CreateSession(userIDt, "token-old")
	sm.CreateSession(userIDt, "token-new")

	if _, ok := sm.GetUserIdByToken("token-old"); ok {
		t.Fatal("expected old token to be evicted")
	}

	userID, ok := sm.GetUserIdByToken("token-new")
	if !ok {
		t.Fatal("expected new token to be present")
	}
	if userID != userIDt {
		t.Fatalf("expected user id %s, got %s", userIDt, userID)
	}

	sm.DeleteSession("token-new")
	if _, ok := sm.GetUserIdByToken("token-new"); ok {
		t.Fatal("expected token to be removed after delete")
	}
}

// TestCreateSessionEvictsTokensRecachedFromTheStore pins the case a restart
// creates. A token that reached the cache through a database lookup is not in
// UIDToToken, so evicting only the newest token per user would leave it working
// after its row was deleted.
func TestCreateSessionEvictsTokensRecachedFromTheStore(t *testing.T) {
	sm := NewSessionManager()
	// What GetUserIdByToken's database fallback leaves behind.
	sm.TokenToUID["recovered-from-store"] = "user"
	sm.Expires["recovered-from-store"] = time.Now().Add(time.Hour)

	if err := sm.CreateSession("user", "fresh"); err != nil {
		t.Fatal(err)
	}
	if _, ok := sm.GetUserIdByToken("recovered-from-store"); ok {
		t.Fatal("a token re-cached from the store outlived the new session")
	}
	if _, ok := sm.GetUserIdByToken("fresh"); !ok {
		t.Fatal("the new session is not resolvable")
	}
}

// TestSessionExpiryHonoursTheIdleWindowAndTheAbsoluteCap pins the sliding
// expiry math: activity moves the deadline forward, never past the cap.
func TestSessionExpiryHonoursTheIdleWindowAndTheAbsoluteCap(t *testing.T) {
	createdAt := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	fresh := sessionExpiry(createdAt, createdAt)
	if want := createdAt.Add(SessionIdleTTL); !fresh.Equal(want) {
		t.Fatalf("fresh session expires at %s, want the idle window %s", fresh, want)
	}

	// A user active every day still loses the session at the absolute cap.
	active := sessionExpiry(createdAt, createdAt.Add(SessionAbsoluteTTL-time.Hour))
	if want := createdAt.Add(SessionAbsoluteTTL); !active.Equal(want) {
		t.Fatalf("active session expires at %s, want the cap %s", active, want)
	}

	if SessionIdleTTL >= SessionAbsoluteTTL {
		t.Fatal("the idle window must be shorter than the absolute cap")
	}
}

