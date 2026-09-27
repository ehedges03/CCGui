import { pack, unpack } from "../lib/MessagePack";
import { getDefault, type Logger } from "../lib/log";
import { base64encode } from "../lib/utils";
import { Events } from "../system/event";
import { Threads } from "../system/threads";

type Listener = (message: any) => void;

// Seconds between pings
const PING_RATE = 30;
const MAX_RETRIES = 3;
let nextConnectionId = 0;

enum BASE_ROUTES {
    PING = 0,
    PONG = 1,
}

export type ConnectionStatus =
    | {
          state: "connected";
      }
    | {
          state: "connecting";
          attempts: number;
          lastError?: string;
      }
    | {
          state: "stopped";
          reason: "requested" | "exhausted" | "no_creds";
      };

export class WebsocketConnection {
    private static readonly RETRY_RATE = 10;
    private readonly connectionId = nextConnectionId++;

    private get log(): Logger {
        return getDefault()
            .with("component", "WebsocketConnection")
            .with("connectionId", this.connectionId);
    }
    private status: ConnectionStatus = {
        state: "stopped",
        reason: "requested",
    };
    private url: string | undefined;
    private apiKey: string | undefined;

    private websocket: WebSocket | undefined;
    private lastPingPongTime: number = 0;

    private setStatus(status: ConnectionStatus): void {
        this.status = status;
        Events.WebSocketConnectionState.emit(this.connectionId, status.state);
    }

    public setUrl(url: string) {
        this.url = url;
    }

    public setCredentials(apiKey: string) {
        this.apiKey = apiKey;
    }

    public start() {
        if (this.websocket !== undefined) {
            this.setStatus({ state: "connected" });
        } else {
            this.setStatus({ state: "connecting", attempts: 0 });
        }
        const pingingThread = Threads.createThread(
            () => {
                while (this.status.state !== "stopped") {
                    Threads.sleep(PING_RATE);
                    this.ping(0);
                }
            },
            { debugId: "ws_pinging" },
        );
        const connectionThread = Threads.createThread(
            () => {
                while (this.status.state === "connecting") {
                    this.connect();
                }
            },
            { priority: Threads.Priority.HIGHEST, debugId: "ws_connection" },
        );
        connectionThread.start();
        pingingThread.start();
    }

    public stop() {
        this.setStatus({ state: "stopped", reason: "requested" });
        if (this.websocket === undefined) {
            this.log.warn("websocket not connected, skipping close");
            return;
        }
        this.websocket.close();
    }

    private connect(): boolean {
        if (this.url === undefined || this.apiKey === undefined) {
            this.setStatus({ state: "stopped", reason: "no_creds" });
            return false;
        }

        let attempts = 0;
        if (this.status.state === "connecting") {
            attempts = this.status.attempts;
        } else {
            this.setStatus({ state: "connecting", attempts });
        }

        if (attempts >= MAX_RETRIES) {
            this.setStatus({ state: "stopped", reason: "exhausted" });
            return false;
        }

        const headers = new LuaMap<string, string>();
        headers.set("Authorization", `Bearer ${this.apiKey}`);
        http.websocketAsync(this.url, headers);
        const event = Threads.pullEvent([
            "websocket_success",
            "websocket_failure",
        ]);

        this.log.trace("websocket event", "event", event.get_name());
        if (event.get_name() === "websocket_success") {
            this.websocket = event.handle;
            this.setStatus({ state: "connected" });
            this.log.debug("websocket connected", "url", this.url);
        } else {
            this.setStatus({
                state: "connecting",
                attempts: attempts + 1,
                lastError: event.error,
            });
            this.log.error("websocket failed to connect", "err", event.error);
            Threads.sleep(WebsocketConnection.RETRY_RATE);
            return false;
        }
        return true;
    }

    private handle() {
        this.log.trace("listening for websocket events");
        while (this.websocket !== undefined) {
            this.log.trace("waiting for websocket event");
            const event = Threads.pullEvent([
                "websocket_closed",
                "websocket_message",
            ]);
            if (event.url !== this.url) {
                continue;
            }
            if (event instanceof Events.WebSocketMessage) {
                this.log.trace("received websocket_message event");
                this.handleMessage(event.content, event.isBinary);
            } else if (event instanceof Events.WebSocketClose) {
                this.log.info(
                    "websocket closed",
                    "reason",
                    event.reason ?? "unknown",
                    "code",
                    event.code ?? "unknown",
                );
                this.websocket.close();
                this.websocket = undefined;
                this.url = undefined;
                break;
            }
        }
        this.log.trace("exiting websocket listener");
    }

    private handleMessage(message: string, isBinary: boolean) {
        if (!isBinary) {
            this.log.warn("received non-binary message, skipping");
            return;
        }
        const data = unpack(message);
        this.log.debug("received websocket message", "data", data);
    }

    public send(message: any) {
        if (this.status.state !== "connected") {
            this.log.error(
                "websocket connection is stopped, unable to send message",
            );
            return;
        }

        while (this.websocket === undefined) {
            this.log.warn(
                "websocket not connected, unable to send message, retrying...",
            );
            Threads.yield();
        }
        const data = pack(message);
        this.log.debug(
            "sending websocket message",
            "message",
            message,
            "pack_b64",
            base64encode(data),
        );
        this.websocket.send(data, true);
    }

    public getState(): ConnectionStatus["state"] {
        return this.status.state;
    }

    public isConnected(): boolean {
        return this.status.state === "connected";
    }

    public waitForConnectionState(): "connected" | "stopped" {
        while (this.status.state === "connecting") {
            const event = Threads.pullEvent(["websocket_connection_state"]);
            if (event.connectionId !== this.connectionId) {
                continue;
            }
        }

        return this.status.state;
    }

    public ping(value: number) {
        if (this.websocket === undefined) {
            this.log.warn("websocket not connected, skipping ping");
            return;
        }
        const data = pack([BASE_ROUTES.PING, value]);
        this.log.debug(
            "pinging websocket",
            "value",
            value,
            "pack_b64",
            base64encode(data),
        );
        this.websocket.send(data, true);
    }
}
