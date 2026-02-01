package websocket

import (
	"bytes"

	"github.com/vmihailenco/msgpack/v5"
)

type Message int

const (
	MessagePing Message = iota
	MessagePong
)

func makeMessage(a ...any) *bytes.Buffer {
	buf := new(bytes.Buffer)
	enc := msgpack.NewEncoder(buf)
	enc.Encode(a)
	return buf
}
