package middleware

import (
	"sync"
	"time"
)

// AttemptLimiter counts failed attempts per key inside a fixed window, so one
// account can be slowed down without touching its neighbours. That is the gap
// the peer-keyed limiter cannot close: behind a reverse proxy every request
// arrives from the same address.
//
// Only failures count, and a success forgets them, so a member who mistypes a
// password and then gets it right is not left throttled.
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

// maxTrackedKeys bounds the memory a stream of made-up keys can occupy.
const maxTrackedKeys = 10000

// NewAttemptLimiter allows limit failures per key per window.
func NewAttemptLimiter(limit int, window time.Duration) *AttemptLimiter {
	return &AttemptLimiter{
		limit:    limit,
		window:   window,
		attempts: map[string]*attemptWindow{},
	}
}

// RetryAfter reports how long the key stays locked, or zero when it is free.
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

// Fail records one failed attempt against the key.
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
		// The window is anchored on the first failure, so a slow guesser cannot
		// push the lock away by trickling attempts.
		l.attempts[key] = &attemptWindow{count: 1, until: now.Add(l.window)}
		return
	}
	entry.count++
}

// Reset forgets a key, which is what a successful sign-in does.
func (l *AttemptLimiter) Reset(key string) {
	if key == "" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
