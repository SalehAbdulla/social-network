package tests

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

func expiryInThePast(t *testing.T, repo *repositories.DB, userID, token string) {
	t.Helper()
	sum := sha256.Sum256([]byte(token))
	if err := repo.SavePasswordReset("expired-reset", userID, hex.EncodeToString(sum[:]),
		time.Now().Add(-time.Minute), time.Now().Add(-service.ResetTokenTTL)); err != nil {
		t.Fatal(err)
	}
}

func TestPasswordResetFlow(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	serverURL, _ := url.Parse(server.URL)

	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)

	browser := newIntegrationClient(t, server)
	browser.login("dummy@example.com")
	beforeToken := sessionCookie(t, browser, serverURL)
	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, 200)

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

	if status := loginStatus(t, newIntegrationClient(t, server), "dummy@example.com", seededPassword); status != http.StatusBadRequest {
		t.Fatalf("the old password still signs in: %d", status)
	}
	newIntegrationClient(t, server).call("POST", "/api/v1/auth/login",
		url.Values{"identifier": {"dummy@example.com"}, "password": {"ResetPassword123!"}}, 200)

	clientWithToken(t, server, beforeToken).call("GET", "/api/v1/users/me", nil, http.StatusUnauthorized)
	if rows := sessionRowCount(t, repo, "dummy-id"); rows != 1 {
		t.Fatalf("expected only the new sign-in's session, got %d", rows)
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 0 {
		t.Fatalf("the spent token was left behind: %d rows", rows)
	}
}

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

	weak := confirm(first, "short", http.StatusBadRequest)
	if weak.Error == "" {
		t.Fatalf("a weak password was accepted: %+v", weak)
	}
	if rows := resetRowCount(t, repo, "dummy-id"); rows != 1 {
		t.Fatalf("a refused password spent the token: %d rows", rows)
	}

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

	reused := confirm(second, "ThirdLinkPassword123!", http.StatusBadRequest)
	if !strings.Contains(reused.Error, "invalid or has expired") {
		t.Fatalf("unexpected refusal for a spent link: %+v", reused)
	}
	unknown := confirm("not-a-real-token", "FourthLinkPassword123!", http.StatusBadRequest)
	if unknown.Error != reused.Error {
		t.Fatalf("a spent link and an unknown one answer differently: %q vs %q", reused.Error, unknown.Error)
	}

	request()
	expired := mailer.token(t)
	expiryInThePast(t, repo, "dummy-id", expired)
	refused := confirm(expired, "FifthLinkPassword123!", http.StatusBadRequest)
	if !strings.Contains(refused.Error, "invalid or has expired") {
		t.Fatalf("unexpected refusal for an expired link: %+v", refused)
	}
}

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
	var total int
	if err := repo.Conn.QueryRow("SELECT COUNT(*) FROM passwordReset").Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != 1 {
		t.Fatalf("expected one token in total, found %d", total)
	}
}

func TestPasswordResetIsRateLimitedWithoutRevealingAnything(t *testing.T) {
	manager := isolatedSessionManager(t)
	server, repo := integrationServer(t, true, false)
	manager.UseStore(repo)
	mailer := &captureMailer{}
	resetFlow(t, repo, manager, mailer)
	client := newIntegrationClient(t, server)

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
