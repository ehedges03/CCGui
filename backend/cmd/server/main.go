package main

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"ehedges.net/ccgui/backend/gen/auth/v1/authv1connect"
	"ehedges.net/ccgui/backend/gen/log/v1/logv1connect"
	"ehedges.net/ccgui/backend/internal/accounts"
	"ehedges.net/ccgui/backend/internal/auth"
	"ehedges.net/ccgui/backend/internal/controller"
	"ehedges.net/ccgui/backend/internal/db"
	"github.com/google/uuid"
	cli "github.com/urfave/cli/v3"
	"gorm.io/gorm"
)

type contextHandler struct {
	slog.Handler
}

func (h *contextHandler) Handle(ctx context.Context, r slog.Record) error {
	if requestTrace, ok := RequestTraceFromContext(ctx); ok {
		r.AddAttrs(
			slog.Group("request_trace",
				slog.String("request_id", requestTrace.RequestID),
				slog.String("method", requestTrace.Method),
				slog.String("path", requestTrace.Path),
			),
		)
	}

	if principal, err := auth.PrincipalFromContext(ctx); err == nil {
		r.AddAttrs(
			slog.Group("auth",
				slog.String("account_id", principal.ID),
				slog.String("refresh_family_id", principal.RefreshFamilyID),
				slog.String("access_token_id", principal.AccessTokenID),
			),
		)
	}
	return h.Handler.Handle(ctx, r)
}

func (h *contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &contextHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h *contextHandler) WithGroup(name string) slog.Handler {
	return &contextHandler{Handler: h.Handler.WithGroup(name)}
}

func main() {
	var programLevel slog.LevelVar
	programLevel.Set(slog.LevelDebug)

	logHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: &programLevel,
	})

	logger := slog.New(&contextHandler{Handler: logHandler})
	slog.SetDefault(logger)

	cmd := &cli.Command{
		Name:           "ccgui",
		Version:        "v0.1.0",
		Usage:          "command line tool to configure and run ccgui",
		DefaultCommand: "serve",
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:    "db-path",
				Aliases: []string{"db"},
				Value:   "data/ccgui.db",
				Usage:   "path to the sqlite database file",
			},
		},
		Commands: []*cli.Command{
			{
				Name:  "serve",
				Usage: "start the server",
				Flags: []cli.Flag{
					&cli.IntFlag{
						Name:    "port",
						Aliases: []string{"p"},
						Value:   8080,
						Usage:   "port to listen on",
						Local:   true,
					},
				},
				Action: serve,
			},
			{
				Name:  "users",
				Usage: "user related controls",
				Commands: []*cli.Command{
					{
						Name:  "create",
						Usage: "create a new user",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:  "name",
								Usage: "name of the new user",
							},
							&cli.StringFlag{
								Name:  "username",
								Usage: "username of the new user",
							},
						},
						Action: createUser,
					},
				},
			},
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		slog.Error("command failed", "err", err)
	}
}

func openDatabase(path string) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}
	return db.OpenSqliteDB(path)
}

func createUser(ctx context.Context, cmd *cli.Command) error {
	gdb, err := openDatabase(cmd.String("db-path"))
	if err != nil {
		return err
	}
	svc := auth.New(gdb, accounts.New(gdb), time.Now)

	p := newPrompter(os.Stdin, os.Stdout)
	account, err := createUserFromInput(ctx, svc, p, cmd.String("name"), cmd.String("username"))
	if err != nil {
		return err
	}

	fmt.Printf("Created user %s with account id %s\n", account.Name, account.ID)
	return nil
}

func serve(ctx context.Context, cmd *cli.Command) error {
	mux := http.NewServeMux()

	dbPath := cmd.String("db-path")
	gdb, err := openDatabase(dbPath)
	if err != nil {
		return err
	}
	accountsService := accounts.New(gdb)
	authService := auth.New(gdb, accountsService, time.Now)
	authAPIHandler := auth.NewAPIHandler(authService)
	authHandlerPath, authHandler := authv1connect.NewAuthServiceHandler(authAPIHandler)
	mux.Handle(authHandlerPath, authHandler)
	logServicePath, logServiceHandler := logv1connect.NewLogServiceHandler(
		controller.NewLogController(slog.Default()),
	)
	mux.Handle(logServicePath, logServiceHandler)

	port := cmd.Int("port")
	srv := &http.Server{
		Addr: fmt.Sprintf(":%d", port),
		// Seperate resolve from check to support logging with account information and keep logging of failed auth
		Handler: withRequestTracing(
			auth.WithResolvedAuth(
				withLogging(withCORS(auth.WithCheckedAuth(mux))),
				authService,
			),
		),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("connectrpc server listening", "port", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
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
		slog.InfoContext(r.Context(), "request",
			"status", recorder.status,
			"duration", time.Since(start),
		)
	})
}

type RequestTrace struct {
	RequestID string
	Method    string
	Path      string
}

type contextKey struct{}

var requestTraceContextKey = contextKey{}

func RequestTraceFromContext(ctx context.Context) (*RequestTrace, bool) {
	requestTrace, ok := ctx.Value(requestTraceContextKey).(*RequestTrace)
	return requestTrace, ok
}

func withRequestTracing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := uuid.NewString()
		w.Header().Set("X-Request-ID", reqID)

		requestTrace := RequestTrace{
			RequestID: reqID,
			Method:    r.Method,
			Path:      r.URL.Path,
		}
		ctx := context.WithValue(r.Context(), requestTraceContextKey, &requestTrace)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
