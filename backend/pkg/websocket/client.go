package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait = 10 * time.Second

	pongWait = 30 * time.Second

	pingPeriod = (pongWait * 8) / 10

	maxMessageSize = 4096

	SendBufferSize = 256
)

type Client struct {
	Hub                *Hub
	Conn               *websocket.Conn
	Send               chan []byte
	UserID             string
	CurrentChatPartner string
}

func (c *Client) ReadPump(handleMessage func(client *Client, messageType int, data []byte)) {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		messageType, data, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			break
		}

		handleMessage(c, messageType, data)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <- ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func defaultMessageHandler(c *Client, messageType int, data []byte) {
	if messageType != websocket.TextMessage {
		return
	}

	var msg WSMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("failed to unmarshal WebSocket message: %v", err)
		return
	}

	switch msg.Type {
	case MsgTypePrivateMsg:
		log.Printf("received private_msg from user %s: %s", c.UserID, msg.Text)
	default:
		log.Printf("unknown message type: %s", msg.Type)
	}
}