package controller

import (
	"context"
	"log/slog"
	"maps"
	"slices"
	"time"

	"connectrpc.com/connect"
	logv1 "ehedges.net/ccgui/backend/gen/log/v1"
)

// LogController writes client-shipped logs into the server's slog output.
type LogController struct {
	logger *slog.Logger
}

func NewLogController(logger *slog.Logger) *LogController {
	return &LogController{logger: logger}
}

func (c *LogController) ShipLogs(ctx context.Context, req *connect.Request[logv1.ShipLogsRequest]) (*connect.Response[logv1.ShipLogsResponse], error) {
	handler := c.logger.Handler()

	for _, entry := range req.Msg.GetEntries() {
		level := slog.Level(entry.GetLevel())
		if !handler.Enabled(ctx, level) {
			continue
		}
		record := slog.NewRecord(time.UnixMilli(entry.GetTimeUnixMs()), level, entry.GetMessage(), 0)
		attrs := entry.GetAttrs()
		for _, key := range slices.Sorted(maps.Keys(attrs)) {
			record.AddAttrs(slog.String(key, attrs[key]))
		}
		if err := handler.Handle(ctx, record); err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
	}

	return connect.NewResponse(&logv1.ShipLogsResponse{}), nil
}
