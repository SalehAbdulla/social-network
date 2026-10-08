package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

const tourPath = "../../scripts/api-tour.sh"

var untoured = map[string]string{}

var (
	routingLiteral = regexp.MustCompile(`"(GET|POST|PUT|DELETE|PATCH) (/api/v1/[^"]*|/ws)"`)
	routingLoop    = regexp.MustCompile(`for _, method := range \[\]string\{([^}]*)\}`)
	routingVerb    = regexp.MustCompile(`"([A-Z]+)"`)
	routingBuilt   = regexp.MustCompile(`method\s*\+\s*"\s*(/api/v1/[^"]*)"`)
	tourAnnotation = regexp.MustCompile(`(?m)^# route: (GET|POST|PUT|DELETE|PATCH) (\S+)$`)
)

func routedPatterns(t *testing.T) map[string]bool {
	t.Helper()
	source, err := os.ReadFile("router.go")
	if err != nil {
		t.Fatal(err)
	}
	patterns := map[string]bool{}
	var verbs []string
	for _, line := range strings.Split(string(source), "\n") {
		if match := routingLoop.FindStringSubmatch(line); match != nil {
			verbs = nil
			for _, verb := range routingVerb.FindAllStringSubmatch(match[1], -1) {
				verbs = append(verbs, verb[1])
			}
			continue
		}
		if match := routingBuilt.FindStringSubmatch(line); match != nil {
			for _, verb := range verbs {
				patterns[verb+" "+match[1]] = true
			}
			continue
		}
		for _, match := range routingLiteral.FindAllStringSubmatch(line, -1) {
			patterns[match[1]+" "+match[2]] = true
		}
	}
	if len(patterns) < 50 {
		t.Fatalf("only %d routes were read out of router.go: the check would pass over almost anything", len(patterns))
	}
	return patterns
}

func tourPatterns(t *testing.T) map[string]bool {
	t.Helper()
	source, err := os.ReadFile(tourPath)
	if err != nil {
		t.Fatalf("the tour is the other half of this check: %v", err)
	}
	annotated := map[string]bool{}
	for _, match := range tourAnnotation.FindAllStringSubmatch(string(source), -1) {
		annotated[match[1]+" "+match[2]] = true
	}
	if len(annotated) < 50 {
		t.Fatalf("only %d routes were found in %s: it must have lost its `# route:` lines", len(annotated), tourPath)
	}
	return annotated
}

func TestAPITourCoversEveryRoute(t *testing.T) {
	routes := routedPatterns(t)
	annotated := tourPatterns(t)

	for route := range routes {
		if annotated[route] {
			continue
		}
		if reason, excused := untoured[route]; excused {
			t.Logf("%s is not toured: %s", route, reason)
			continue
		}
		t.Errorf("%s is routed in router.go and no `# route:` line in %s calls it", route, tourPath)
	}
	for route := range annotated {
		if !routes[route] {
			t.Errorf("%s is annotated in %s and router.go does not route it: a rename, or a typo", route, tourPath)
		}
	}
	for route, reason := range untoured {
		if !routes[route] {
			t.Errorf("untoured explains %s (%s), which router.go does not route", route, reason)
		}
		if annotated[route] {
			t.Errorf("untoured explains %s (%s), but the tour calls it", route, reason)
		}
	}
}
