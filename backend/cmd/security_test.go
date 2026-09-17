package main

import (
 "net/http"
 "net/http/httptest"
 "testing"
)

func TestSecurityOriginAndRateLimits(t *testing.T) {
 handler:=Security(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){w.WriteHeader(204)}))
 bad:=httptest.NewRequest("POST","http://localhost/api/v1/posts",nil);bad.Header.Set("Origin","https://evil.example")
 response:=httptest.NewRecorder();handler.ServeHTTP(response,bad);if response.Code!=403{t.Fatalf("cross-origin write accepted: %d",response.Code)}
 for i:=0;i<21;i++ {r:=httptest.NewRequest("POST","http://localhost/api/v1/auth/login",nil);w:=httptest.NewRecorder();handler.ServeHTTP(w,r);expected:=204;if i==20{expected=429};if w.Code!=expected{t.Fatalf("request %d: got %d",i,w.Code)}}
}
