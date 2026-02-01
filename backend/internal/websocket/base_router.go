package websocket

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"
)

type BaseRoute int

const (
	BaseRouteInvalid BaseRoute = iota - 1
	BaseRoutePing
	BaseRoutePong
)

func BaseRouteFromInt(i int) BaseRoute {
	if i < 0 {
		return BaseRouteInvalid
	} else if i > int(BaseRoutePong) {
		return BaseRouteInvalid
	} else {
		return BaseRoute(i)
	}
}

func baseRouterDecoder(dec *msgpack.Decoder) (BaseRoute, error) {
	pathRaw, err := dec.DecodeInt()
	if err != nil {
		return BaseRouteInvalid, err
	}

	path := BaseRouteFromInt(pathRaw)

	if path == BaseRouteInvalid {
		return path, errors.New("invalid route")
	}

	return path, nil
}

func handlePing(data int, ctx WSRequestContext) error {
	if ctx.conn == nil {
		return errors.New("no websocket connection in context")
	}
	buf := makeMessage(MessagePong, data)
	err := ctx.conn.WriteMessage(websocket.BinaryMessage, buf.Bytes())
	slog.Info("sent message", "message", fmt.Sprintf("% X", buf), "data", data)
	return err
}

func handlePong(data int, ctx WSRequestContext) error {
	return nil
}

func NewBaseRouter() *Router[BaseRoute] {
	router := NewRouter(baseRouterDecoder)

	router.Register(BaseRoutePing, NewDecodedRoute((*msgpack.Decoder).DecodeInt, handlePing))
	router.Register(BaseRoutePong, NewDecodedRoute((*msgpack.Decoder).DecodeInt, handlePong))

	return router
}
