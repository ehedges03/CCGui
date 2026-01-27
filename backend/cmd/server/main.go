package main

import (
	"log"
	"net/http"
	"time"

	"example.com/ccgui-template/backend/gen/hello/v1/hellov1connect"
	"example.com/ccgui-template/backend/internal/handler"
)

func main() {
	mux := http.NewServeMux()
	path, connectHandler := hellov1connect.NewHelloServiceHandler(&handler.HelloServer{})
	mux.Handle(path, connectHandler)

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("connectrpc server listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set(
			"Access-Control-Allow-Headers",
			"Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Connect-Accept-Encoding",
		)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
