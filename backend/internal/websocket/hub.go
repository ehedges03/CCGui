package websocket

import (
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

type Hub struct {
	upgrader  websocket.Upgrader
	clients   map[*websocket.Conn]bool
	broadcast chan []byte
	mu        sync.RWMutex
	validator APIKeyValidator
	byKeyID   map[string]map[*websocket.Conn]struct{}
}

type APIKeyValidator interface {
	Validate(plain string) bool
}

type APIKeyResolver interface {
	ResolveID(plain string) (string, bool)
}

func NewHub(validator APIKeyValidator) *Hub {
	return &Hub{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan []byte),
		validator: validator,
		byKeyID:   make(map[string]map[*websocket.Conn]struct{}),
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	if h.validator != nil && !h.isAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	keyID := h.resolveKeyID(r)

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("failed to upgrade websocket", "err", err)
		return
	}

	defer conn.Close()

	h.mu.Lock()
	h.clients[conn] = true
	if keyID != "" {
		h.attachKeyIDLocked(conn, keyID)
	}
	h.mu.Unlock()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			h.mu.Lock()
			delete(h.clients, conn)
			if keyID != "" {
				h.detachKeyIDLocked(conn, keyID)
			}
			h.mu.Unlock()
			break
		}
		h.broadcast <- message
	}
	// TODO: Route messages to controllers instead of broadcasting.
}

func (h *Hub) Run() {
	for {
		message := <-h.broadcast

		h.mu.Lock()
		for client := range h.clients {
			if err := client.WriteMessage(websocket.TextMessage, message); err != nil {
				client.Close()
				delete(h.clients, client)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) isAuthorized(r *http.Request) bool {
	if h.validator == nil {
		return true
	}

	if key := r.URL.Query().Get("api_key"); key != "" {
		return h.validator.Validate(key)
	}

	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		const prefix = "Bearer "
		if strings.HasPrefix(authHeader, prefix) {
			return h.validator.Validate(strings.TrimPrefix(authHeader, prefix))
		}
	}

	return false
}

func (h *Hub) CloseByKeyID(id string) {
	if id == "" {
		return
	}
	h.mu.Lock()
	conns := h.byKeyID[id]
	delete(h.byKeyID, id)
	for conn := range conns {
		delete(h.clients, conn)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "key deleted"))
		conn.Close()
	}
	h.mu.Unlock()
}

func (h *Hub) resolveKeyID(r *http.Request) string {
	resolver, ok := h.validator.(APIKeyResolver)
	if !ok {
		return ""
	}
	if key := r.URL.Query().Get("api_key"); key != "" {
		if id, ok := resolver.ResolveID(key); ok {
			return id
		}
		return ""
	}
	if authHeader := r.Header.Get("Authorization"); authHeader != "" {
		const prefix = "Bearer "
		if strings.HasPrefix(authHeader, prefix) {
			if id, ok := resolver.ResolveID(strings.TrimPrefix(authHeader, prefix)); ok {
				return id
			}
		}
	}
	return ""
}

func (h *Hub) attachKeyIDLocked(conn *websocket.Conn, id string) {
	conns := h.byKeyID[id]
	if conns == nil {
		conns = make(map[*websocket.Conn]struct{})
		h.byKeyID[id] = conns
	}
	conns[conn] = struct{}{}
}

func (h *Hub) detachKeyIDLocked(conn *websocket.Conn, id string) {
	conns := h.byKeyID[id]
	if conns == nil {
		return
	}
	delete(conns, conn)
	if len(conns) == 0 {
		delete(h.byKeyID, id)
	}
}
