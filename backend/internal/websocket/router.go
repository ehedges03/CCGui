package websocket

import (
	"context"

	"github.com/gorilla/websocket"
)

type MessageHandler func(ctx context.Context, conn *websocket.Conn, payload []byte) error

type Router struct {
	// TODO: add routing table and metadata for message handlers.
}

func NewRouter() *Router {
	return &Router{}
}

func (r *Router) Register(messageType string, handler MessageHandler) {
	// TODO: register handler for messageType.
}
