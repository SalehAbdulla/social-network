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
