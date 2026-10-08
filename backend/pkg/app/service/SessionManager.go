package service

import (
	"sync"
	"time"

	"social-network/backend/pkg/app/repositories"
)

const (
	SessionIdleTTL       = 14 * 24 * time.Hour
	SessionAbsoluteTTL   = 30 * 24 * time.Hour
	sessionTouchInterval = time.Minute
)

type SessionManager struct {
	mu    sync.RWMutex
	store *repositories.DB

	TokenToUID map[string]string
	UIDToToken map[string]string
	Expires    map[string]time.Time
	Created    map[string]time.Time
	LastSeen   map[string]time.Time
	Presence   map[string]time.Time
}

var DefaultSessionManager = NewSessionManager()

func NewSessionManager() *SessionManager {
	return &SessionManager{
		TokenToUID: make(map[string]string),
		UIDToToken: make(map[string]string),
		Expires:    make(map[string]time.Time),
		Created:    make(map[string]time.Time),
		LastSeen:   make(map[string]time.Time),
		Presence:   make(map[string]time.Time),
	}
}

func (m *SessionManager) UseStore(store *repositories.DB) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.store = store
}

// idle timeout, but never past the absolute one
func sessionExpiry(createdAt, now time.Time) time.Time {
	idle := now.Add(SessionIdleTTL)
	if capped := createdAt.Add(SessionAbsoluteTTL); capped.Before(idle) {
		return capped
	}
	return idle
}

func (m *SessionManager) evictLocked(token string) {
	userID, ok := m.TokenToUID[token]
	if !ok {
		return
	}
	delete(m.TokenToUID, token)
	delete(m.Expires, token)
	delete(m.Created, token)
	delete(m.LastSeen, token)
	if current, ok := m.UIDToToken[userID]; ok && current == token {
		delete(m.UIDToToken, userID)
	}
	delete(m.Presence, userID)
}

func (m *SessionManager) forget(token string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.evictLocked(token)
}

func (m *SessionManager) CreateSession(userID, token string) error {
	m.mu.RLock()
	store := m.store
	m.mu.RUnlock()

	now := time.Now()
	expiresAt := sessionExpiry(now, now)
	if store != nil {
		if err := store.SaveSession(token, userID, now, expiresAt); err != nil {
			return err
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for cached, owner := range m.TokenToUID {
		if owner == userID && cached != token {
			m.evictLocked(cached)
		}
	}
	if existingUserID, ok := m.TokenToUID[token]; ok && existingUserID != userID {
		m.evictLocked(token)
	}
	m.TokenToUID[token] = userID
	m.Expires[token] = expiresAt
	m.Created[token] = now
	m.LastSeen[token] = now
	m.UIDToToken[userID] = token
	m.Presence[userID] = now.UTC()
	return nil
}

func (m *SessionManager) RevokeAllForUser(userID string) (int64, error) {
	m.mu.RLock()
	store := m.store
	m.mu.RUnlock()

	var removed int64
	if store != nil {
		count, err := store.DeleteSessionsForUser(userID)
		if err != nil {
			return 0, err
		}
		removed = count
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for token, owner := range m.TokenToUID {
		if owner == userID {
			m.evictLocked(token)
		}
	}
	return removed, nil
}

func (m *SessionManager) GetUserIdByToken(token string) (string, bool) {
	if token == "" {
		return "", false
	}

	m.mu.RLock()
	store := m.store
	userID, cached := m.TokenToUID[token]
	expiresAt := m.Expires[token]
	createdAt := m.Created[token]
	lastSeenAt := m.LastSeen[token]
	m.mu.RUnlock()

	now := time.Now()
	if cached {
		if !now.Before(expiresAt) {
			m.forget(token)
			if store != nil {
				_ = store.DeleteSessionRow(token)
			}
			return "", false
		}
		if now.Sub(lastSeenAt) >= sessionTouchInterval {
			refreshed := sessionExpiry(createdAt, now)
			m.mu.Lock()
			stale := m.LastSeen[token].Equal(lastSeenAt)
			if stale {
				m.LastSeen[token] = now
				m.Expires[token] = refreshed
			}
			m.mu.Unlock()
			if stale && store != nil {
				_ = store.TouchSession(token, now, refreshed)
			}
		}
		return userID, true
	}

	if store == nil {
		return "", false
	}
	session, err := store.SessionByToken(token)
	if err != nil {
		return "", false
	}
	if !now.Before(session.ExpiresAt) {
		_ = store.DeleteSessionRow(token)
		return "", false
	}

	m.mu.Lock()
	m.TokenToUID[token] = session.UserID
	m.Expires[token] = session.ExpiresAt
	m.Created[token] = session.CreatedAt
	m.LastSeen[token] = now
	m.mu.Unlock()
	return session.UserID, true
}

func (m *SessionManager) DeleteSession(token string) {
	m.mu.RLock()
	store := m.store
	m.mu.RUnlock()

	m.forget(token)
	if store != nil {
		_ = store.DeleteSessionRow(token)
	}
}

func (m *SessionManager) CleanupExpired() (int64, error) {
	m.mu.RLock()
	store := m.store
	m.mu.RUnlock()
	if store == nil {
		return 0, nil
	}

	now := time.Now()
	removed, err := store.DeleteStaleSessions(now, now.Add(-SessionAbsoluteTTL), now.Add(-SessionIdleTTL))
	if err != nil {
		return 0, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for token, expiresAt := range m.Expires {
		if !now.Before(expiresAt) {
			m.evictLocked(token)
		}
	}
	return removed, nil
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
