package websocket

import (
	"encoding/json"
	"sync"
)

type Hub struct {
	mu sync.RWMutex

	clients map[string]*Client

	Register chan *Client

	Unregister chan *Client

	broadcast chan []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.clients[client.UserID] = client
			h.mu.Unlock()

			h.broadcastUserStatus(client.UserID, 1, client.UserID)

		case client := <-h.Unregister:
			h.mu.Lock()
			// Only unregister if this exact connection is the registered one,
			// and only broadcast offline once (ReadPump also unregisters on close).
			current, ok := h.clients[client.UserID]
			if ok && current == client {
				delete(h.clients, client.UserID)
				close(client.Send)
			}
			h.mu.Unlock()

			if ok && current == client {
				h.broadcastUserStatus(client.UserID, 0, "")
			}

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client.UserID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) SendToUser(userID string, message []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	client, ok := h.clients[userID]
	if !ok {
		return false
	}

	select {
	case client.Send <- message:
		return true
	default:
		return false
	}
}

func (h *Hub) BroadcastToAll(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.clients {
		select {
		case client.Send <- message:
		default:
			close(client.Send)
			delete(h.clients, client.UserID)
		}
	}
}

func (h *Hub) broadcastUserStatus(userID string, isOnline int, excludeUserID string) {
	payload := UserStatusPayload{
		UserId:   userID,
		IsOnline: isOnline,
	}

	data, err := json.Marshal(map[string]interface{}{
		"type":    MsgTypeUserStatus,
		"payload": payload,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for uid, client := range h.clients {
		if uid == excludeUserID {
			continue
		}
		select {
		case client.Send <- data:
		default:
			close(client.Send)
			delete(h.clients, uid)
		}
	}
}

func (h *Hub) IsUserOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	_, ok := h.clients[userID]
	return ok
}

func (h *Hub) GetClientByUserID(userID string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.clients[userID]
}

func (h *Hub) GetOnlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]string, 0, len(h.clients))
	for userID := range h.clients {
		users = append(users, userID)
	}
	return users
}