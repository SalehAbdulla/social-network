package websocket

import (
	"encoding/json"
	"sync"
)

type Hub struct {
	mu         sync.RWMutex
	clients    map[string]map[*Client]struct{}
	Register   chan *Client
	Unregister chan *Client
	done       chan struct{}
	stop       sync.Once
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]map[*Client]struct{}), Register: make(chan *Client), Unregister: make(chan *Client), done: make(chan struct{})}
}

func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			h.mu.Lock()
			for _, clients := range h.clients {
				for client := range clients {
					close(client.Send)
				}
			}
			h.clients = make(map[string]map[*Client]struct{})
			h.mu.Unlock()
			return
		case client := <-h.Register:
			h.mu.Lock()
			first := len(h.clients[client.UserID]) == 0
			if first {
				h.clients[client.UserID] = make(map[*Client]struct{})
			}
			h.clients[client.UserID][client] = struct{}{}
			h.mu.Unlock()
			if first {
				h.broadcastUserStatus(client.UserID, 1, client.UserID)
			}
		case client := <-h.Unregister:
			h.mu.Lock()
			_, present := h.clients[client.UserID][client]
			if present {
				delete(h.clients[client.UserID], client)
				close(client.Send)
			}
			offline := present && len(h.clients[client.UserID]) == 0
			if offline {
				delete(h.clients, client.UserID)
			}
			h.mu.Unlock()
			if offline {
				h.broadcastUserStatus(client.UserID, 0, "")
			}
		}
	}
}

func (h *Hub) Stop() { h.stop.Do(func() { close(h.done) }) }

func (h *Hub) SendToUser(userID string, message []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	delivered := false
	for client := range h.clients[userID] {
		select {
		case client.Send <- message:
			delivered = true
		default:
		}
	}
	return delivered
}

func (h *Hub) BroadcastToAll(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, clients := range h.clients {
		for client := range clients {
			select {
			case client.Send <- message:
			default:
			}
		}
	}
}

func (h *Hub) broadcastUserStatus(userID string, isOnline int, excludeUserID string) {
	data, err := json.Marshal(map[string]any{"type": MsgTypeUserStatus, "payload": UserStatusPayload{UserId: userID, IsOnline: isOnline}})
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for uid, clients := range h.clients {
		if uid != excludeUserID {
			for client := range clients {
				select {
				case client.Send <- data:
				default:
				}
			}
		}
	}
}

func (h *Hub) IsUserOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID]) > 0
}
func (h *Hub) GetClientByUserID(userID string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients[userID] {
		return client
	}
	return nil
}
func (h *Hub) GetOnlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	users := []string{}
	for id := range h.clients {
		users = append(users, id)
	}
	return users
}
