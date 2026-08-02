package service

import (
	"sync"
	"time"
)

type SessionManager struct {
	mu sync.RWMutex

	TokenToUID map[string]string
	UIDToToken map[string]string
	Presence   map[string]time.Time
}

var DefaultSessionManager = NewSessionManager()

func NewSessionManager() *SessionManager {
	return &SessionManager{
		TokenToUID: make(map[string]string),
		UIDToToken: make(map[string]string),
		Presence:   make(map[string]time.Time),
	}
}

func (m *SessionManager) CreateSession(userID, token string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if previousToken, ok := m.UIDToToken[userID]; ok {
		delete(m.TokenToUID, previousToken)
	}

	if existingUserID, ok := m.TokenToUID[token]; ok && existingUserID != userID {
		delete(m.UIDToToken, existingUserID)
	}

	m.TokenToUID[token] = userID
	m.UIDToToken[userID] = token
	m.Presence[userID] = time.Now().UTC()
}

func (m *SessionManager) GetUserIdByToken(token string) (string, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	userID, ok := m.TokenToUID[token]
	return userID, ok
}

func (m *SessionManager) DeleteSession(token string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	userID, ok := m.TokenToUID[token]
	if !ok {
		return
	}

	delete(m.TokenToUID, token)
	delete(m.UIDToToken, userID)
	delete(m.Presence, userID)
}

func (m *SessionManager) UpdatePresence(userID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.Presence[userID] = time.Now().UTC()
}

func (m *SessionManager) IsUserOnline(userID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	timestamp, ok := m.Presence[userID]
	if !ok {
		return false
	}

	return time.Since(timestamp) < 60*time.Second
}
