package controller

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"connectrpc.com/connect"

	hellov1 "ehedges.net/ccgui/backend/gen/hello/v1"
)

type HelloController struct{}

func (s *HelloController) Say(
	ctx context.Context,
	req *connect.Request[hellov1.SayRequest],
) (*connect.Response[hellov1.SayResponse], error) {
	const maxProduct = 1000

	if req.Msg.A == nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.New("missing required field: a"),
		)
	}

	if req.Msg.B == nil {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.New("missing required field: b"),
		)
	}

	a := req.Msg.GetA()
	b := req.Msg.GetB()
	if a*b > maxProduct {
		return nil, connect.NewError(
			connect.CodeOutOfRange,
			fmt.Errorf("a * b must be <= %d", maxProduct),
		)
	}

	res := connect.NewResponse(&hellov1.SayResponse{
		Message: fmt.Sprintf("Result: %d", a*b),
	})
	res.Header().Set("X-Hello-Server", "connectrpc")
	return res, nil
}

func (s *HelloController) Greet(
	ctx context.Context,
	req *connect.Request[hellov1.GreetRequest],
) (*connect.Response[hellov1.GreetResponse], error) {
	name := strings.TrimSpace(req.Msg.GetName())
	if name == "" {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.New("missing required field: name"),
		)
	}

	log.Printf("greet request name=%q", name)

	res := connect.NewResponse(&hellov1.GreetResponse{
		Message: fmt.Sprintf("Hello, %s!", name),
	})
	res.Header().Set("X-Hello-Server", "connectrpc")
	return res, nil
}
