import { LogEntry, LogServiceDefinition } from "../gen/log/v1/log";
import * as log from "../lib/log";
import { Threads } from "../system/threads";
import { ApiClient, ServiceClient } from "./ApiClient";

// Seconds between flushes
const FLUSH_RATE = 5;
// Oldest entries are dropped beyond this many buffered logs
const MAX_BUFFERED = 500;

export class LogShipper {
    private readonly logService: ServiceClient<typeof LogServiceDefinition>;
    private readonly logger = new log.Logger({ component: "LogShipper" });
    private buffer: LogEntry[] = [];

    constructor(api: ApiClient) {
        this.logService = new ServiceClient(api, LogServiceDefinition);
    }

    // Runs inside every log call, so it must not log or yield.
    public consume(entry: log.Log) {
        const attrs: Record<string, string> = {};
        for (const [key, value] of Object.entries(entry.attrs)) {
            attrs[key] = log.serializeLogValue(value);
        }
        this.buffer.push({
            timeUnixMs: tostring(entry.time),
            level: entry.level,
            message: entry.message,
            attrs,
        });
        this.trim();
    }

    public getConsumer() {
        return (entry: log.Log) => {
            this.consume(entry);
        };
    }

    public start() {
        Threads.createThread(
            () => {
                while (Threads.sleep(FLUSH_RATE) === undefined) {
                    this.flush();
                }
                // Terminated: higher shutdown ranks have exited, ship what's left.
                this.flush();
            },
            {
                shutdownRank: Threads.ShutdownRank.SINK,
                debugId: "log_shipper",
            },
        ).start();
    }

    private flush() {
        if (this.buffer.length === 0) {
            return;
        }
        const entries = this.buffer;
        this.buffer = [];
        const result = this.logService.call("shipLogs", { entries });
        if (!result.success) {
            // Requeue ahead of anything logged during the call.
            this.buffer = [...entries, ...this.buffer];
            this.trim();
            this.logger.warn(
                "failed to ship logs",
                "code",
                result.code,
                "err",
                result.message,
            );
        }
    }

    private trim() {
        if (this.buffer.length > MAX_BUFFERED) {
            this.buffer.splice(0, this.buffer.length - MAX_BUFFERED);
        }
    }
}
