package main

import (
	"bufio"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"ehedges.net/ccgui/backend/gen/auth/v1/authv1connect"
	"ehedges.net/ccgui/backend/gen/hello/v1/hellov1connect"
	"ehedges.net/ccgui/backend/internal/auth"
	"ehedges.net/ccgui/backend/internal/controller"
	"ehedges.net/ccgui/backend/internal/websocket"
)

func main() {
	var programLevel slog.LevelVar
	programLevel.Set(slog.LevelDebug)

	logHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: &programLevel,
	})

	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	mux := http.NewServeMux()
	apiKeyManager := auth.NewManager()
	wsHub := websocket.NewHub(apiKeyManager)
	deleteCh, deleteUnsub := apiKeyManager.SubscribeDeletes()
	defer deleteUnsub()
	go func() {
		for id := range deleteCh {
			wsHub.CloseByKeyID(id)
		}
	}()
	mux.HandleFunc("/ws", wsHub.HandleWS)
	path, connectHandler := hellov1connect.NewHelloServiceHandler(&controller.HelloController{})
	mux.Handle(path, connectHandler)
	authController := controller.NewAuthController(apiKeyManager)
	authHandlerPath, authHandler := authv1connect.NewAuthServiceHandler(authController)
	mux.Handle(authHandlerPath, authHandler)

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           withLogging(withCORS(mux)),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("connectrpc server listening", "port", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server failed", "err", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set(
			"Access-Control-Allow-Headers",
			"Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Connect-Accept-Encoding, Authorization",
		)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("response does not implement http.Hijacker")
	}
	return hijacker.Hijack()
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{
			ResponseWriter: w,
			status:         http.StatusOK,
		}
		next.ServeHTTP(recorder, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration", time.Since(start),
		)
	})
}
