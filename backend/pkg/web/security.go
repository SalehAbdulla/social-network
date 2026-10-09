package web

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const defaultRateLimitPerMinute = 1200

func EffectiveRateLimitPerMinute() int {
	if App.RateLimitPerMinute > 0 {
		return App.RateLimitPerMinute
	}
	return defaultRateLimitPerMinute
}

func Security(next http.Handler) http.Handler {
	type bucket struct {
		count int
		until time.Time
	}
	var mu sync.Mutex
	buckets := map[string]bucket{}
	deny := func(w http.ResponseWriter, status int, message string) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": message, "code": status})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				parsed, err := url.Parse(origin)
				if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || (origin != App.FrontendOrigin && parsed.Host != r.Host) {
					deny(w, 403, "origin not allowed")
					return
				}
			} else if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				deny(w, 403, "origin not allowed")
				return
			}
		}
		peer, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			peer = r.RemoteAddr
		}
		limit := EffectiveRateLimitPerMinute()
		key := peer
		if r.URL.Path == "/api/v1/auth/login" || r.URL.Path == "/api/v1/auth/register" {
			limit = 20
			key += "/auth"
		}
		now := time.Now()
		mu.Lock()
		if len(buckets) > 10000 {
			for k, b := range buckets {
				if now.After(b.until) {
					delete(buckets, k)
				}
			}
		}
		b := buckets[key]
		if now.After(b.until) {
			b = bucket{until: now.Add(time.Minute)}
		}
		b.count++
		buckets[key] = b
		mu.Unlock()
		if b.count > limit {
			w.Header().Set("Retry-After", "60")
			deny(w, 429, "Too many requests. Try again in one minute.")
			return
		}
		size := int64(1 << 20)
		if r.URL.Path == "/api/v1/media" {
			size = 51 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, size)
		defer func() {
			if r.MultipartForm != nil {
				r.MultipartForm.RemoveAll()
			}
		}()
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}
