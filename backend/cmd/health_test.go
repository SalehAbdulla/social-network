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

	anonymous.call("POST", "/api/v1/health", nil, 404)
	anonymous.call("POST", "/api/v1/ready", nil, 404)

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
