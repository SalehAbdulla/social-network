package service

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
)

// Mailer delivers one plain-text message. It is an interface for two reasons: the
// reset flow has to be testable without a mail server, and the provider is a
// deployment decision rather than a code one.
type Mailer interface {
	Send(to, subject, body string) error
	// Describe names the delivery path for a log line, so "reset requested" can
	// say where the link went — or that it went nowhere.
	Describe() string
}

// LogMailer writes the message to the application log instead of sending it. It
// is what development uses, and it must never be what production uses: a reset
// link in a log file is a working credential in a log file. main.go refuses to
// build it when APP_ENV=production, and the endpoint answers 503 instead.
type LogMailer struct {
	Logger *slog.Logger
}

func (m LogMailer) Describe() string { return "log (no provider configured)" }

func (m LogMailer) Send(to, subject, body string) error {
	if m.Logger != nil {
		m.Logger.Warn("mail not sent: no provider configured, writing it to the log instead",
			"to", to, "subject", subject, "body", body)
	}
	return nil
}

// SMTPMailer talks to an SMTP server through net/smtp, which is standard library,
// so the provider costs no dependency. STARTTLS is used whenever the server
// advertises it and authentication only when credentials are configured, which is
// what makes a local relay without auth and a hosted provider with auth both
// workable. Note that net/smtp's PlainAuth refuses to send a password over an
// unencrypted connection unless the host is a loopback address.
type SMTPMailer struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func (m SMTPMailer) Describe() string { return "smtp " + net.JoinHostPort(m.Host, m.Port) }

func (m SMTPMailer) Send(to, subject, body string) error {
	client, err := smtp.Dial(net.JoinHostPort(m.Host, m.Port))
	if err != nil {
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: m.Host}); err != nil {
			return err
		}
	}
	if m.Username != "" {
		if ok, _ := client.Extension("AUTH"); !ok {
			return errors.New("smtp server does not offer authentication")
		}
		if err := client.Auth(smtp.PlainAuth("", m.Username, m.Password, m.Host)); err != nil {
			return err
		}
	}
	if err := client.Mail(m.From); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	// The body is plain ASCII by construction (a URL and English sentences), so
	// no transfer encoding is needed; the header says so rather than leaving the
	// reader to guess.
	message := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n",
		m.From, to, subject, body,
	)
	if _, err := writer.Write([]byte(message)); err != nil {
		writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}
