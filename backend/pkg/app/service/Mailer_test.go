package service

import (
	"bufio"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

// smtpStub is a minimal SMTP server: enough of RFC 5321 for net/smtp's client to
// walk a message through, and no more. It exists so the SMTP mailer is tested by
// talking to something rather than by reading its own source back.
type smtpStub struct {
	listener   net.Listener
	messages   chan string
	offersAuth bool

	mu       sync.Mutex
	authLine string
}

func newSMTPStub(t *testing.T, offersAuth bool) *smtpStub {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	stub := &smtpStub{listener: listener, messages: make(chan string, 4), offersAuth: offersAuth}
	go stub.serve()
	t.Cleanup(func() { listener.Close() })
	return stub
}

func (s *smtpStub) hostPort() (string, string) {
	host, port, err := net.SplitHostPort(s.listener.Addr().String())
	if err != nil {
		panic(err)
	}
	return host, port
}

func (s *smtpStub) authenticated() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.authLine != ""
}

func (s *smtpStub) serve() {
	for {
		connection, err := s.listener.Accept()
		if err != nil {
			return
		}
		go s.handle(connection)
	}
}

// handle speaks the sequence the client expects: greeting, EHLO with the extension
// lines, then the envelope and the data.
func (s *smtpStub) handle(connection net.Conn) {
	defer connection.Close()
	reader := bufio.NewReader(connection)
	writer := bufio.NewWriter(connection)
	reply := func(line string) {
		writer.WriteString(line + "\r\n")
		writer.Flush()
	}

	reply("220 stub.invalid ESMTP")
	var message strings.Builder
	inData := false
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if inData {
			if trimmed == "." {
				inData = false
				s.messages <- message.String()
				message.Reset()
				reply("250 2.0.0 Ok: queued")
				continue
			}
			message.WriteString(trimmed + "\n")
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "EHLO"), strings.HasPrefix(trimmed, "HELO"):
			// AUTH is advertised because PlainAuth refuses to run otherwise.
			// STARTTLS deliberately is not: that is the local-relay case, and it
			// is also why this stub has to sit on a loopback address, since
			// net/smtp will not send a password unencrypted to anywhere else.
			reply("250-stub.invalid")
			if s.offersAuth {
				reply("250-AUTH PLAIN")
			}
			reply("250 8BITMIME")
		case strings.HasPrefix(trimmed, "AUTH"):
			s.mu.Lock()
			s.authLine = trimmed
			s.mu.Unlock()
			reply("235 2.7.0 Authentication successful")
		case strings.HasPrefix(trimmed, "MAIL FROM"):
			reply("250 2.1.0 Ok")
		case strings.HasPrefix(trimmed, "RCPT TO"):
			reply("250 2.1.5 Ok")
		case trimmed == "DATA":
			inData = true
			reply("354 End data with <CR><LF>.<CR><LF>")
		case trimmed == "QUIT":
			reply("221 2.0.0 Bye")
			return
		default:
			reply("250 2.0.0 Ok")
		}
	}
}

func TestSMTPMailerDeliversTheMessage(t *testing.T) {
	stub := newSMTPStub(t, true)
	host, port := stub.hostPort()
	mailer := SMTPMailer{Host: host, Port: port, From: "no-reply@example.com"}

	if err := mailer.Send("member@example.com", "Reset your pingup password", "Open http://localhost:4000/reset?token=abc123"); err != nil {
		t.Fatalf("send: %v", err)
	}
	select {
	case message := <-stub.messages:
		for _, want := range []string{
			"To: member@example.com",
			"From: no-reply@example.com",
			"Subject: Reset your pingup password",
			"Content-Type: text/plain; charset=UTF-8",
			"http://localhost:4000/reset?token=abc123",
		} {
			if !strings.Contains(message, want) {
				t.Fatalf("the message is missing %q:\n%s", want, message)
			}
		}
	case <-time.After(3 * time.Second):
		t.Fatal("the stub never received a message")
	}
	if mailer.Describe() == "" {
		t.Fatal("Describe has to name the delivery path for the log line")
	}
}

func TestSMTPMailerAuthenticatesWhenCredentialsAreSet(t *testing.T) {
	stub := newSMTPStub(t, true)
	host, port := stub.hostPort()
	mailer := SMTPMailer{Host: host, Port: port, Username: "postmaster", Password: "hunter2", From: "no-reply@example.com"}

	if err := mailer.Send("member@example.com", "Subject", "Body"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if !stub.authenticated() {
		t.Fatal("credentials were configured but no AUTH reached the server")
	}
}

func TestSMTPMailerRefusesAServerThatCannotAuthenticate(t *testing.T) {
	stub := newSMTPStub(t, false)
	host, port := stub.hostPort()
	mailer := SMTPMailer{Host: host, Port: port, Username: "postmaster", Password: "hunter2", From: "no-reply@example.com"}

	// Refusing is the point: delivering the message unauthenticated would silently
	// downgrade a deliberate configuration to none at all.
	if err := mailer.Send("member@example.com", "Subject", "Body"); err == nil {
		t.Fatal("a server without AUTH accepted credentials silently")
	}
}

func TestSMTPMailerReportsAnUnreachableServer(t *testing.T) {
	// Nothing listens on port 1, so the dial fails. The mailer has to report that
	// rather than pretend a link went out: the reset flow deletes the token on this
	// path, so a swallowed error would leave a live token nobody holds.
	mailer := SMTPMailer{Host: "127.0.0.1", Port: "1", From: "no-reply@example.com"}
	if err := mailer.Send("member@example.com", "Subject", "Body"); err == nil {
		t.Fatal("an unreachable server was reported as a successful send")
	}
}
