package websocket

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// The protocol is documented in the backend README, where somebody adding an event will look
// for it, and this test is what keeps the two together. It reads the document out of the
// repository rather than holding a copy, so it cannot pass against a README that no longer
// says what it used to.
const protocolDocPath = "../../README.md"

// clientOnlyEvents are documented without being constants, because the browser makes them up:
// they never cross the wire. Kept in a list with a reason rather than inferred, so that adding
// one is a deliberate edit to this file.
var clientOnlyEvents = map[string]string{
	"connected": "synthesised by the frontend when the socket opens; it never crosses the wire",
}

var (
	// MsgTypeTypingStopped = "typing_stopped"
	eventConstant = regexp.MustCompile(`(MsgType\w+)\s*=\s*"([a-z_]+)"`)
	// type IncomingMsgPayload struct {
	payloadStruct = regexp.MustCompile(`(?m)^type (\w+Payload) struct`)
)

// protocolSection returns the README from its protocol heading to the next top-level heading,
// so a name that appears in unrelated prose cannot count as documented.
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

// TestProtocolDocumentCoversEveryEvent fails by name in both directions: an event the server
// defines but nobody documented, and a name the document promises that nothing produces. The
// second direction is what catches a renamed event that was left in the table.
func TestProtocolDocumentCoversEveryEvent(t *testing.T) {
	source, err := os.ReadFile("types.go")
	if err != nil {
		t.Fatal(err)
	}
	declared := map[string]string{} // wire name -> Go constant
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

// TestProtocolDocumentNamesEveryPayload pins the other half of the protocol: a payload struct
// added to types.go has to be named where the event that carries it is described. Several
// events carry inline maps instead (message_changed, read_receipt, social_changed,
// group_changed, notification_changed), which have no struct to name and are covered by their
// field lists in the tables.
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

// tableNames reads the event names out of the two tables' first column. A row that names two
// events in one cell (`typing`, `typing_stopped`) yields only the first, which is fine: this
// function only feeds the direction that reports names nothing produces, and a name it misses
// is a check not made rather than a wrong failure.
//
// Only rows after a `| --- |` separator are read, so the header cell (`type`) is not mistaken
// for an event name.
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
			continue // the header row, which sits before the separator
		}
		cell := strings.TrimPrefix(line, "| ")
		name := strings.TrimSpace(strings.SplitN(cell, "`", 3)[1])
		names[name] = true
	}
	return names
}
