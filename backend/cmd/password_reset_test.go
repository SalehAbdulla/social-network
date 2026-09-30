package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	realtimeforum "social-network/backend"
	"social-network/backend/pkg/app/handlers"
	"social-network/backend/pkg/app/repositories"
	"social-network/backend/pkg/app/service"
	"social-network/backend/pkg/middleware"
)

// captureMailer stands in for the provider. Capturing is the only way a test can
// hold the token that went out in a link, and failing on demand is what makes the
// "delivery failed" path reachable at all.
type captureMailer struct {
	mu       sync.Mutex
	sent     []capturedMail
	failWith error
}

type capturedMail struct{ to, subject, body string }

func (m *captureMailer) Send(to, subject, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failWith != nil {
		return m.failWith
	}
	m.sent = append(m.sent, capturedMail{to: to, subject: subject, body: body})
	return nil
}

func (m *captureMailer) Describe() string { return "test capture" }

func (m *captureMailer) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sent)
}

func (m *captureMailer) recipients() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	found := make([]string, 0, len(m.sent))
	for _, mail := range m.sent {
		found = append(found, mail.to)
	}
	return found
}

// token reads the newest link, which is where the flow's secret actually travels.
func (m *captureMailer) token(t *testing.T) string {
	t.Helper()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.sent) == 0 {
		t.Fatal("no reset mail was sent")
	}
	body := m.sent[len(m.sent)-1].body
	const marker = "/reset?token="
	index := strings.Index(body, marker)
	if index < 0 {
		t.Fatalf("the reset mail carries no link: %s", body)
	}
	token := body[index+len(marker):]
	if stop := strings.IndexAny(token, "\r\n"); stop >= 0 {
		token = token[:stop]
	}
	return token
}

// resetFlow points the handler at this test's mailer, so the request path runs
// the real service and only delivery is replaced.
func resetFlow(t *testing.T, repo *repositories.DB, manager *service.SessionManager, mailer service.Mailer) {
	t.Helper()
	handlers.HandlerCtx.PasswordResetService = service.NewPasswordResetService(repo, manager, mailer, "http://localhost:4000")
}

func resetRowCount(t *testing.T, repo *repositories.DB, userID string) int {
	t.Helper()
	var count int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM passwordReset WHERE userId = ?", userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func storedResetHash(t *testing.T, repo *repositories.DB, userID string) string {
	t.Helper()
	var hash string
	if err := repo.Conn.QueryRow("SELECT tokenHash FROM passwordReset WHERE userId = ?", userID).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	return hash
}

// loginStatus attempts a sign-in and reports the status instead of asserting it,
// which is what "the old password no longer works" needs. It speaks the form
// encoding the login endpoint is driven with elsewhere.
func loginStatus(t *testing.T, client integrationClient, email, password string) int {
	t.Helper()
	form := url.Values{"identifier": {email}, "password": {password}}
	request, err := http.NewRequest("POST", client.base+"/api/v1/auth/login", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	return response.StatusCode
}

// expiryInThePast writes a token that can no longer be claimed, without waiting
// thirty minutes for one to age.
func expiryInThePast(t *testing.T, repo *repositories.DB, userID, token string) {
	t.Helper()
	sum := sha256.Sum256([]byte(token))
	if err := repo.SavePasswordReset("expired-reset", userID, hex.EncodeToString(sum[:]),
		time.Now().Add(-time.Minute), time.Now().Add(-service.ResetTokenTTL)); err != nil {
		t.Fatal(err)
	}
}

// TestPasswordResetFlow covers the path end to end: the address gets a link, the
// link carries a token the table never stores in clear, redeeming it changes the
// password, and every session the account had — including the one that asked — is
// gone afterwards.
func TestPasswordResetFlow(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	serverURL, _ := url.Parse(server.URL)

	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)

	// A signed-in browser, whose session the reset has to end.
	browser := newIntegrationClient(t, server)
	browser.login("dummy@example.com")
	beforeToken := sessionCookie(t, browser, serverURL)
	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, 200)

	// The address is sent the way a person types it, because the lookup has to
	// normalise it exactly as registration stored it.
	accepted := decoded[map[string]string](t, browser.call("POST", "/api/v1/auth/password-reset",
		map[string]string{"email": "Dummy@Example.com "}, http.StatusAccepted))
	if !strings.Contains(accepted["message"], "If that address has an account") {
		t.Fatalf("unexpected answer: %+v", accepted)
	}
	if mailer.count() != 1 {
		t.Fatalf("expected exactly one mail, got %d", mailer.count())
	}
	if recipients := mailer.recipients(); recipients[0] != "dummy@example.com" {
		t.Fatalf("the link went to the wrong address: %v", recipients)
	}

	token := mailer.token(t)
	// The token travels in the link and nowhere else: the table holds its sha256,
	// so a leaked database does not hand over a working link.
	sum := sha256.Sum256([]byte(token))
	if stored := storedResetHash(t, repo, "dummy-id"); stored == token || stored != hex.EncodeToString(sum[:]) {
		t.Fatalf("the table does not hold the token's hash: %q", stored)
	}

	confirmed := decoded[map[string]string](t, newIntegrationClient(t, server).call("POST",
		"/api/v1/auth/password-reset/confirm", map[string]string{
			"token": token, "password": "ResetPassword123!", "confirmPassword": "ResetPassword123!",
		}, 200))
	if confirmed["message"] == "" {
		t.Fatalf("unexpected body: %+v", confirmed)
	}

	// The old credential is gone and the new one signs in. Wrong credentials answer
	// 400 in this API (`ErrInvalidCredentials`), which is what the login-lockout
	// test pins too.
	if status := loginStatus(t, newIntegrationClient(t, server), "dummy@example.com", seededPassword); status != http.StatusBadRequest {
		t.Fatalf("the old password still signs in: %d", status)
	}
	newIntegrationClient(t, server).call("POST", "/api/v1/auth/login",
		url.Values{"identifier": {"dummy@example.com"}, "password": {"ResetPassword123!"}}, 200)

	// Every session of the account is dead, the resetting browser included: this
	// is the "I lost control of this account" path, so nothing stays signed in.
	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, http.StatusUnauthorized)
	if rows := sessionRowCount(t, repo, "dummy-id"); rows != 1 {
		t.Fatalf("expected only the new sign-in's session, got %d", rows)
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 0 {
		t.Fatalf("the spent token was left behind: %d rows", rows)
	}
}

// TestPasswordResetTokenRules pins the three ways a token stops working: it is
// single-use, it expires, and a newer request replaces it. It also pins that a
// password the register form would refuse is refused *before* the token is spent,
// so a typo does not cost the visitor their link.
func TestPasswordResetTokenRules(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)

	client := newIntegrationClient(t, server)
	request := func() {
		client.call("POST", "/api/v1/auth/password-reset", map[string]string{"email": "dummy@example.com"}, http.StatusAccepted)
	}
	confirm := func(token, password string, status int) errorEnvelope {
		t.Helper()
		return callRaw(t, client, "POST", "/api/v1/auth/password-reset/confirm", map[string]string{
			"token": token, "password": password, "confirmPassword": password,
		}, status)
	}

	request()
	first := mailer.token(t)

	// A weak password is refused by the shared rules, and the link survives it.
	weak := confirm(first, "short", http.StatusBadRequest)
	if weak.Error == "" {
		t.Fatalf("a weak password was accepted: %+v", weak)
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 1 {
		t.Fatalf("a refused password spent the token: %d rows", rows)
	}

	// A second request replaces the first link, so an older mail stops working.
	request()
	second := mailer.token(t)
	if second == first {
		t.Fatal("two requests produced the same token")
	}
	replaced := confirm(first, "FirstLinkPassword123!", http.StatusBadRequest)
	if !strings.Contains(replaced.Error, "invalid or has expired") {
		t.Fatalf("unexpected refusal for a replaced link: %+v", replaced)
	}

	confirm(second, "SecondLinkPassword123!", http.StatusOK)

	// Spent: the same token cannot be used twice, and it is not reported
	// differently from a token that never existed.
	reused := confirm(second, "ThirdLinkPassword123!", http.StatusBadRequest)
	if !strings.Contains(reused.Error, "invalid or has expired") {
		t.Fatalf("unexpected refusal for a spent link: %+v", reused)
	}
	unknown := confirm("not-a-real-token", "FourthLinkPassword123!", http.StatusBadRequest)
	if unknown.Error != reused.Error {
		t.Fatalf("a spent link and an unknown one answer differently: %q vs %q", reused.Error, unknown.Error)
	}

	// Expired: the row is written with a past expiry rather than waiting out the
	// real window.
	request()
	expired := mailer.token(t)
	expiryInThePast(t, repo, "dummy-id", expired)
	refused := confirm(expired, "FifthLinkPassword123!", http.StatusBadRequest)
	if !strings.Contains(refused.Error, "invalid or has expired") {
		t.Fatalf("unexpected refusal for an expired link: %+v", refused)
	}
}

// rawReset posts a request and returns the status, the Retry-After header and the
// error envelope, because the rate-limited answer is the one case where a header is
// part of the contract.
func rawReset(t *testing.T, client integrationClient, email string) (int, string, errorEnvelope) {
	t.Helper()
	encoded, err := json.Marshal(map[string]string{"email": email})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest("POST", client.base+"/api/v1/auth/password-reset", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)
	var envelope errorEnvelope
	_ = json.Unmarshal(data, &envelope)
	return response.StatusCode, response.Header.Get("Retry-After"), envelope
}

// TestPasswordResetAnswersTheSameForAnUnknownAddress pins the property the flow is
// built around: the endpoint cannot be used to find out which addresses exist.
func TestPasswordResetAnswersTheSameForAnUnknownAddress(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)
	client := newIntegrationClient(t, server)

	known := decoded[map[string]string](t, client.call("POST", "/api/v1/auth/password-reset",
		map[string]string{"email": "dummy@example.com"}, http.StatusAccepted))
	unknown := decoded[map[string]string](t, client.call("POST", "/api/v1/auth/password-reset",
		map[string]string{"email": "nobody@example.com"}, http.StatusAccepted))
	if known["message"] != unknown["message"] {
		t.Fatalf("the answer differs by whether the address exists: %q vs %q", known["message"], unknown["message"])
	}
	if mailer.count() != 1 || mailer.recipients()[0] != "dummy@example.com" {
		t.Fatalf("the mail went somewhere unexpected: %d to %v", mailer.count(), mailer.recipients())
	}
	// Exactly one token exists, and it belongs to the address that has an account:
	// nothing at all is recorded for the other one.
	var total int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM passwordReset").Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != 1 {
		t.Fatalf("expected one token in total, found %d", total)
	}
}

// TestPasswordResetIsRateLimitedWithoutRevealingAnything checks the limit the item
// asked for, and the part that is easy to get wrong: it has to apply to an address
// with no account too, or the limit itself answers the question the endpoint
// refuses to answer.
func TestPasswordResetIsRateLimitedWithoutRevealingAnything(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)
	client := newIntegrationClient(t, server)

	// The window is swapped for a short one the way the login-lockout test does it,
	// so the assertion is about the behaviour rather than about the production
	// constant's value.
	const attempts = 3
	handlers.HandlerCtx.ResetLimiter = middleware.NewAttemptLimiter(attempts, 400*time.Millisecond)

	for i := 1; i <= attempts; i++ {
		if status, _, _ := rawReset(t, client, "dummy@example.com"); status != http.StatusAccepted {
			t.Fatalf("request %d was not accepted: %d", i, status)
		}
	}
	status, retryAfter, envelope := rawReset(t, client, "dummy@example.com")
	if status != http.StatusTooManyRequests || envelope.Code != http.StatusTooManyRequests {
		t.Fatalf("the request past the limit was not refused with 429: %d %+v", status, envelope)
	}
	if retryAfter == "" {
		t.Fatal("the rate-limited answer carries no Retry-After header")
	}
	if mailer.count() != attempts {
		t.Fatalf("expected %d mails before the limit, got %d", attempts, mailer.count())
	}

	for i := 1; i <= attempts; i++ {
		if status, _, _ := rawReset(t, client, "nobody@example.com"); status != http.StatusAccepted {
			t.Fatalf("unknown address, request %d was not accepted: %d", i, status)
		}
	}
	if status, _, _ := rawReset(t, client, "nobody@example.com"); status != http.StatusTooManyRequests {
		t.Fatalf("the limit did not apply to an unknown address: %d", status)
	}
}

// TestPasswordResetIsUnavailableWithoutAProvider is the production posture: with no
// SMTP configured the mailer is nil, so there is no log mailer to write a working
// credential into a log file, and the endpoints say so instead of accepting a
// request whose link will never arrive.
func TestPasswordResetIsUnavailableWithoutAProvider(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	resetFlow(t, repo, manager, nil)
	client := newIntegrationClient(t, server)

	body := map[string]string{
		"email": "dummy@example.com", "token": "anything",
		"password": "ResetPassword123!", "confirmPassword": "ResetPassword123!",
	}
	for _, path := range []string{"/api/v1/auth/password-reset", "/api/v1/auth/password-reset/confirm"} {
		envelope := callRaw(t, client, "POST", path, body, http.StatusServiceUnavailable)
		if !strings.Contains(envelope.Error, "not available") {
			t.Fatalf("%s: unexpected refusal: %+v", path, envelope)
		}
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 0 {
		t.Fatalf("a token was issued without a provider: %d rows", rows)
	}
}

// TestPasswordResetDeliveryFailureLeavesNoLiveToken covers the path where the mail
// cannot be sent. The visitor is told the same thing as ever — a different answer
// for this address would be the oracle again — but the token nobody received is
// discarded rather than left live.
func TestPasswordResetDeliveryFailureLeavesNoLiveToken(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{failWith: errors.New("smtp refused the connection")}
	resetFlow(t, repo, manager, mailer)
	client := newIntegrationClient(t, server)

	accepted := decoded[map[string]string](t, client.call("POST", "/api/v1/auth/password-reset",
		map[string]string{"email": "dummy@example.com"}, http.StatusAccepted))
	if !strings.Contains(accepted["message"], "If that address has an account") {
		t.Fatalf("unexpected answer: %+v", accepted)
	}
	if sent := mailer.count(); sent != 0 {
		t.Fatalf("a refused delivery was recorded as sent: %d", sent)
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 0 {
		t.Fatalf("an undelivered token was left live: %d rows", rows)
	}
}

// TestPasswordResetTokenCannotBeRedeemedTwiceAtOnce is the reason the claim is a
// single UPDATE rather than a read followed by a write: four confirms racing on one
// token have to produce one password change and three refusals. A read-then-write
// design passes the sequential tests above and fails this one, which is exactly why
// it is here.
func TestPasswordResetTokenCannotBeRedeemedTwiceAtOnce(t *testing.T) {
	manager := isolatedSessionManager(t)
	_, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{}
	reset := service.NewPasswordResetService(repo, manager, mailer, "http://localhost:4000")

	if err := reset.RequestReset("dummy-id", "dummy@example.com"); err != nil {
		t.Fatalf("request: %v", err)
	}
	token := mailer.token(t)

	const racers = 4
	results := make(chan error, racers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			password := fmt.Sprintf("RacedPassword%d!", index)
			<-start
			results <- reset.ConfirmReset(token, password)
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)

	succeeded, refused := 0, 0
	for err := range results {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, realtimeforum.ErrInvalidResetToken):
			refused++
		default:
			t.Fatalf("unexpected error from a racing confirm: %v", err)
		}
	}
	if succeeded != 1 || refused != racers-1 {
		t.Fatalf("expected one winner and %d refusals, got %d winners and %d refusals", racers-1, succeeded, refused)
	}
}


