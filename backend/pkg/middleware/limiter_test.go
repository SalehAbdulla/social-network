package middleware

import (
	"testing"
	"time"
)

func TestAttemptLimiterLocksOneKeyOnly(t *testing.T) {
	limiter := NewAttemptLimiter(3, time.Minute)
	limiter.Fail("victim@example.com")
	limiter.Fail("victim@example.com")
	if wait := limiter.RetryAfter("victim@example.com"); wait != 0 {
		t.Fatalf("locked after two failures with a limit of three: %s", wait)
	}
	limiter.Fail("victim@example.com")
	if wait := limiter.RetryAfter("victim@example.com"); wait <= 0 || wait > time.Minute {
		t.Fatalf("third failure did not lock the account: %s", wait)
	}
	limiter.Fail("neighbour@example.com")
	if wait := limiter.RetryAfter("neighbour@example.com"); wait != 0 {
		t.Fatalf("a neighbour was locked by someone else's failures: %s", wait)
	}
}

func TestAttemptLimiterWindowExpiryAndReset(t *testing.T) {
	short := NewAttemptLimiter(1, 50*time.Millisecond)
	short.Fail("late@example.com")
	if wait := short.RetryAfter("late@example.com"); wait <= 0 {
		t.Fatal("the first failure did not lock the key")
	}
	time.Sleep(70 * time.Millisecond)
	if wait := short.RetryAfter("late@example.com"); wait != 0 {
		t.Fatalf("the lock outlived its window: %s", wait)
	}

	reset := NewAttemptLimiter(1, time.Minute)
	reset.Fail("typo@example.com")
	if wait := reset.RetryAfter("typo@example.com"); wait <= 0 {
		t.Fatal("the first failure did not lock the key")
	}
	reset.Reset("typo@example.com")
	if wait := reset.RetryAfter("typo@example.com"); wait != 0 {
		t.Fatalf("a successful sign-in left the key locked: %s", wait)
	}
}

func TestAttemptLimiterPrunesExpiredKeys(t *testing.T) {
	limiter := NewAttemptLimiter(1, 20*time.Millisecond)
	for i := 0; i <= maxTrackedKeys; i++ {
		limiter.Fail(string(rune('a'+i%26)) + "-guessed@example.com")
	}
	time.Sleep(40 * time.Millisecond)
	limiter.Fail("fresh@example.com")
	limiter.mu.Lock()
	tracked := len(limiter.attempts)
	limiter.mu.Unlock()
	if tracked > maxTrackedKeys {
		t.Fatalf("the limiter kept %d keys", tracked)
	}
}
