package main

import (
	"log"
	"net/http"
	"time"

	"ehedges.net/ccgui/backend/gen/hello/v1/hellov1connect"
	"ehedges.net/ccgui/backend/internal/handler"
)

func main() {
	mux := http.NewServeMux()
	path, connectHandler := hellov1connect.NewHelloServiceHandler(&handler.HelloServer{})
	mux.Handle(path, connectHandler)

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           withLogging(withCORS(mux)),
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

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{
			ResponseWriter: w,
			status:         http.StatusOK,
		}
		next.ServeHTTP(recorder, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, recorder.status, time.Since(start))
	})
}
