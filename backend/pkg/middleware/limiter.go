package middleware

import (
	"sync"
	"time"
)

type AttemptLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	attempts map[string]*attemptWindow
}

type attemptWindow struct {
	count int
	until time.Time
}

// without a cap, one key per request would grow the map forever
const maxTrackedKeys = 10000

func NewAttemptLimiter(limit int, window time.Duration) *AttemptLimiter {
	return &AttemptLimiter{
		limit:    limit,
		window:   window,
		attempts: map[string]*attemptWindow{},
	}
}

func (l *AttemptLimiter) RetryAfter(key string) time.Duration {
	if key == "" {
		return 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, ok := l.attempts[key]
	if !ok {
		return 0
	}
	remaining := time.Until(entry.until)
	if remaining <= 0 {
		delete(l.attempts, key)
		return 0
	}
	if entry.count < l.limit {
		return 0
	}
	return remaining
}

func (l *AttemptLimiter) Fail(key string) {
	if key == "" {
		return
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.attempts) > maxTrackedKeys {
		for candidate, entry := range l.attempts {
			if now.After(entry.until) {
				delete(l.attempts, candidate)
			}
		}
	}
	entry, ok := l.attempts[key]
	if !ok || now.After(entry.until) {
		l.attempts[key] = &attemptWindow{count: 1, until: now.Add(l.window)}
		return
	}
	entry.count++
}

func (l *AttemptLimiter) Reset(key string) {
	if key == "" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
