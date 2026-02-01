package websocket

import (
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/vmihailenco/msgpack/v5"
)

var ErrRouteNotFound = errors.New("route not found")
var ErrRouteCollision = errors.New("route already registered")
var ErrInvalidMessage = errors.New("invalid message format")
var ErrNoValueToDecode = errors.New("no value to decode for route")

type Decoder[A any] func(dec *msgpack.Decoder) (A, error)
type DecodedHandler[A any] func(data A, ctx WSRequestContext) error

type Route interface {
	Handle(ctx WSRequestContext, pathLength int, dec *msgpack.Decoder) error
}

type DecodedRoute[A any] struct {
	decode Decoder[A]
	next   DecodedHandler[A]
}

func (r *DecodedRoute[A]) Handle(ctx WSRequestContext, pathLength int, dec *msgpack.Decoder) error {
	if pathLength != 1 {
		slog.Error(ErrNoValueToDecode.Error())
		return ErrNoValueToDecode
	}

	data, err := r.decode(dec)
	if err != nil {
		return err
	}

	return r.next(data, ctx)
}

func NewDecodedRoute[A any](decoder Decoder[A], handler DecodedHandler[A]) *DecodedRoute[A] {
	return &DecodedRoute[A]{
		decode: decoder,
		next:   handler,
	}
}

type Router[A comparable] struct {
	decode Decoder[A]
	mu     sync.RWMutex
	routes map[A]Route
}

func NewRouter[A comparable](decoder Decoder[A]) *Router[A] {
	return &Router[A]{
		decode: decoder,
		routes: make(map[A]Route),
	}
}

func (r *Router[A]) Register(path A, route Route) error {
	if route == nil {
		return fmt.Errorf("%w: nil handler", ErrInvalidMessage)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, taken := r.routes[path]; taken {
		return ErrRouteCollision
	}
	r.routes[path] = route
	return nil
}

func (r *Router[A]) Handle(ctx WSRequestContext, pathLength int, dec *msgpack.Decoder) error {
	path, err := r.decode(dec)
	if err != nil {
		return err
	}

	ctx.path += "/" + fmt.Sprint(path)

	if pathLength < 2 {

	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	route, exists := r.routes[path]
	if !exists {
		return ErrRouteNotFound
	}

	return route.Handle(ctx, pathLength, dec)
}

var testRouter = NewRouter[int]((*msgpack.Decoder).DecodeInt)

func tester() {
	enumRouter := NewDecodedRoute[int](
		(*msgpack.Decoder).DecodeInt,
		func(data int, ctx WSRequestContext) error {
			return nil
		},
	)
	testRouter.Register(1, enumRouter)
}
