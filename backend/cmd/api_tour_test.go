package main

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The API tour (`scripts/api-tour.sh`) calls every route in router.go, and this test is what keeps
// the two together: it reads the router the way the compiler does — including the two loops whose
// patterns are built from a variable — and fails by name in both directions. A renamed route
// lands here instead of becoming a 404 in the tour, and a new route cannot be added in silence.
const tourPath = "../../scripts/api-tour.sh"

// untoured is deliberately empty: every pattern in the router can be called from a shell today.
// A route that cannot be — one that needs a third party to act mid-request, say — belongs here
// with its reason, so the exception is written down rather than the test being weakened.
var untoured = map[string]string{}

var (
	routingLiteral = regexp.MustCompile(`"(GET|POST|PUT|DELETE|PATCH) (/api/v1/[^"]*|/ws)"`)
	routingLoop    = regexp.MustCompile(`for _, method := range \[\]string\{([^}]*)\}`)
	routingVerb    = regexp.MustCompile(`"([A-Z]+)"`)
	routingBuilt   = regexp.MustCompile(`method\s*\+\s*"\s*(/api/v1/[^"]*)"`)
	tourAnnotation = regexp.MustCompile(`(?m)^# route: (GET|POST|PUT|DELETE|PATCH) (\S+)$`)
)

// routedPatterns reads router.go the way it is written: literal patterns wherever they appear,
// and the loops that build one from `method`, each against its own verb list. Reading the two
// loops as if they shared a list produces patterns the router does not have — which is how this
// parser was wrong before it was written down.
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

// tourPatterns is the set of routes the tour says it exercises. It may be larger than the number
// of requests said out loud — the tour registers an account twice on purpose — so only the sets
// are compared.
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
