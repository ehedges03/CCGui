package handler

import (
	"context"
	"fmt"

	"connectrpc.com/connect"

	hellov1 "example.com/ccgui-template/backend/gen/hello/v1"
)

type HelloServer struct{}

func (s *HelloServer) Say(
	ctx context.Context,
	req *connect.Request[hellov1.SayRequest],
) (*connect.Response[hellov1.SayResponse], error) {
	name := req.Msg.GetName()
	if name == "" {
		name = "world"
	}

	res := connect.NewResponse(&hellov1.SayResponse{
		Message: fmt.Sprintf("Hello, %s!", name),
	})
	res.Header().Set("X-Hello-Server", "connectrpc")
	return res, nil
}
