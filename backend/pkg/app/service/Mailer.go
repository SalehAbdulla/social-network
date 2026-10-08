package service

import (
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
)

type Mailer interface {
	Send(to, subject, body string) error
	Describe() string
}

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
