package websocket

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

const protocolDocPath = "../../README.md"

var clientOnlyEvents = map[string]string{
	"connected": "synthesised by the frontend when the socket opens; it never crosses the wire",
}

var (
	eventConstant = regexp.MustCompile(`(MsgType\w+)\s*=\s*"([a-z_]+)"`)
	payloadStruct = regexp.MustCompile(`(?m)^type (\w+Payload) struct`)
)

func protocolSection(t *testing.T) string {
	t.Helper()
	source, err := os.ReadFile(protocolDocPath)
	if err != nil {
		t.Fatalf("the protocol document is the other half of this check: %v", err)
	}
	text := string(source)
	heading := "## WebSocket protocol"
	start := strings.Index(text, heading)
	if start < 0 {
		t.Fatalf("%s has no %q section", protocolDocPath, heading)
	}
	rest := text[start:]
	if end := strings.Index(rest[len(heading):], "\n## "); end >= 0 {
		rest = rest[:len(heading)+end]
	}
	return rest
}

func TestProtocolDocumentCoversEveryEvent(t *testing.T) {
	source, err := os.ReadFile("types.go")
	if err != nil {
		t.Fatal(err)
	}
	declared := map[string]string{}
	for _, match := range eventConstant.FindAllStringSubmatch(string(source), -1) {
		declared[match[2]] = match[1]
	}
	if len(declared) < 10 {
		t.Fatalf("only %d MsgType constants were read out of types.go: the check would pass over anything", len(declared))
	}
	section := protocolSection(t)

	for name, constant := range declared {
		if !strings.Contains(section, "`"+name+"`") {
			t.Errorf("%s (%s) is not in the protocol section: document it, or delete the constant", name, constant)
		}
	}
	for name := range tableNames(section) {
		if _, ok := declared[name]; ok {
			continue
		}
		if _, ok := clientOnlyEvents[name]; ok {
			continue
		}
		t.Errorf("the protocol section documents %q, which no MsgType constant and no client-only entry has: either a typo, or an event somebody sends without declaring", name)
	}
	for name, reason := range clientOnlyEvents {
		if !strings.Contains(section, "`"+name+"`") {
			t.Errorf("the client-only event %q (%s) is missing from the protocol section", name, reason)
		}
	}
}

func TestProtocolDocumentNamesEveryPayload(t *testing.T) {
	source, err := os.ReadFile("types.go")
	if err != nil {
		t.Fatal(err)
	}
	structs := payloadStruct.FindAllStringSubmatch(string(source), -1)
	if len(structs) == 0 {
		t.Fatal("no payload structs were read out of types.go")
	}
	section := protocolSection(t)
	for _, match := range structs {
		if !strings.Contains(section, match[1]) {
			t.Errorf("%s carries a payload the protocol section does not name", match[1])
		}
	}
}

func tableNames(section string) map[string]bool {
	names := map[string]bool{}
	inTable := false
	for _, line := range strings.Split(section, "\n") {
		switch {
		case strings.HasPrefix(line, "| ---"):
			inTable = true
			continue
		case !strings.HasPrefix(line, "| "):
			inTable = false
			continue
		case !inTable:
			continue
		}
		cell := strings.TrimPrefix(line, "| ")
		name := strings.TrimSpace(strings.SplitN(cell, "`", 3)[1])
		names[name] = true
	}
	return names
}
