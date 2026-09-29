package main

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

type errorEnvelope struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    int    `json:"code"`
}

// readProbeEnvelope reads a probe response raw, because the shared call helper
// returns only the data member and the failure case is the interesting one.
func readProbeEnvelope(t *testing.T, client integrationClient, path string, status int) errorEnvelope {
	t.Helper()
	response, err := client.client.Get(client.base + path)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		t.Fatalf("GET %s: expected %d, got %d: %s", path, status, response.StatusCode, body)
	}
	var envelope errorEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("GET %s: response is not JSON: %s", path, body)
	}
	return envelope
}

// TestHealthAndReadinessProbes covers the two URLs the container healthchecks
// call. Both are read by an anonymous client on purpose: a healthcheck runs
// inside the container, so it has no session cookie to offer.
func TestHealthAndReadinessProbes(t *testing.T) {
	server, repo := integrationServer(t, true, false)
	anonymous := newIntegrationClient(t, server)

	health := decoded[map[string]string](t, anonymous.call("GET", "/api/v1/health", nil, 200))
	if health["status"] != "ok" {
		t.Fatalf("unexpected liveness body: %+v", health)
	}
	ready := decoded[map[string]string](t, anonymous.call("GET", "/api/v1/ready", nil, 200))
	if ready["status"] != "ready" {
		t.Fatalf("unexpected readiness body: %+v", ready)
	}

	// The probes answer GET only, so a probe URL cannot be repurposed as a write
	// endpoint. A wrong method reaches the method-less catch-all route rather
	// than a 405, which is the same JSON 404 every unknown path gets.
	anonymous.call("POST", "/api/v1/health", nil, 404)
	anonymous.call("POST", "/api/v1/ready", nil, 404)

	// Liveness and readiness have to differ, because telling them apart is the
	// whole reason there are two: a database that will not answer is not a dead
	// process, and restarting the process would not fix it.
	if err := repo.Conn.Close(); err != nil {
		t.Fatal(err)
	}
	failed := readProbeEnvelope(t, anonymous, "/api/v1/ready", http.StatusServiceUnavailable)
	if failed.Success || failed.Code != http.StatusServiceUnavailable || failed.Error != "database unreachable" {
		t.Fatalf("readiness did not fail closed: %+v", failed)
	}
	alive := decoded[map[string]string](t, anonymous.call("GET", "/api/v1/health", nil, 200))
	if alive["status"] != "ok" {
		t.Fatalf("liveness followed the database down: %+v", alive)
	}
}
