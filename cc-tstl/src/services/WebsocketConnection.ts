import { pack, unpack } from "../lib/MessagePack";
import * as log from "../lib/log";
import { base64encode } from "../lib/utils";
import { Events } from "../system/event";
import { Threads } from "../system/threads";

type Listener = (message: any) => void;

// Seconds between pings
const PING_RATE = 30;
const MAX_RETRIES = 3;
let nextConnectionId = 0;

// Must match BaseRoute in backend/internal/websocket/base_router.go
export enum BASE_ROUTES {
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
          reason: "requested" | "no_creds";
      };

export class WebsocketConnection {
    private static readonly RETRY_RATE = 10;
    private readonly connectionId = nextConnectionId++;
    private readonly logger: log.Logger;
    private readonly listeners = new Map<number, Listener>();

    private status: ConnectionStatus = {
        state: "stopped",
        reason: "requested",
    };
    private readonly url: string;
    private readonly apiKey: string;

    private websocket: WebSocket | undefined;

    constructor(url: string, apiKey: string) {
        this.url = url;
        this.apiKey = apiKey;
        this.logger = new log.Logger({
            component: "WebsocketConnection",
            connectionId: this.connectionId,
        });
    }

    private setStatus(status: ConnectionStatus): void {
        this.status = status;
        Events.WebSocketConnectionState.emit(this.connectionId, status.state);
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
                    if (Threads.sleep(PING_RATE) instanceof Events.Terminate) {
                        this.logger.debug("ws pinging terminating");
                        return;
                    }
                    this.ping(0);
                }
            },
            {
                shutdownRank: Threads.ShutdownRank.CONNECTION,
                debugId: "ws_pinging",
            },
        );
        const connectionThread = Threads.createThread(
            () => {
                while (this.status.state === "connecting") {
                    if (this.connect() instanceof Events.Terminate) {
                        this.logger.debug("ws connecting terminating");
                        return;
                    }
                }
            },
            {
                priority: Threads.Priority.HIGHEST,
                shutdownRank: Threads.ShutdownRank.CONNECTION,
                debugId: "ws_connection",
            },
        );
        connectionThread.start();
        pingingThread.start();
    }

    public stop() {
        this.setStatus({ state: "stopped", reason: "requested" });
        if (this.websocket === undefined) {
            this.logger.warn("websocket not connected, skipping close");
            return;
        }
        this.websocket.close();
    }

    private connect(): Events.Terminate | undefined {
        let attempts = 0;
        if (this.status.state === "connecting") {
            attempts = this.status.attempts;
        } else {
            this.setStatus({ state: "connecting", attempts });
        }

        const headers = new LuaMap<string, string>();
        headers.set("Authorization", `Bearer ${this.apiKey}`);
        http.websocketAsync(this.url, headers);
        const event = Threads.pullEvent([
            "websocket_success",
            "websocket_failure",
        ]);

        if (event instanceof Events.Terminate) {
            return event;
        }

        this.logger.trace("websocket event", "event", event.get_name());
        if (event.get_name() === "websocket_success") {
            this.websocket = event.handle;
            this.setStatus({ state: "connected" });
            this.logger.debug("websocket connected", "url", this.url);
        } else {
            this.setStatus({
                state: "connecting",
                attempts: attempts + 1,
                lastError: event.error,
            });
            this.logger.error(
                "websocket failed to connect",
                "err",
                event.error,
            );
            const sleepEvent = Threads.sleep(WebsocketConnection.RETRY_RATE);
            if (event instanceof Events.Terminate) {
                return event;
            }
        }
    }

    private handle() {
        this.logger.trace("listening for websocket events");
        while (this.websocket !== undefined) {
            this.logger.trace("waiting for websocket event");
            const event = Threads.pullEvent([
                "websocket_closed",
                "websocket_message",
            ]);
            if (event instanceof Events.Terminate) {
                return;
            }
            if (event.url !== this.url) {
                continue;
            }
            if (event instanceof Events.WebSocketMessage) {
                this.logger.trace("received websocket_message event");
                this.handleMessage(event.content, event.isBinary);
            } else if (event instanceof Events.WebSocketClose) {
                this.logger.info(
                    "websocket closed",
                    "reason",
                    event.reason ?? "unknown",
                    "code",
                    event.code ?? "unknown",
                );
                this.websocket.close();
                this.websocket = undefined;
                break;
            }
        }
        this.logger.trace("exiting websocket listener");
    }

    private handleMessage(message: string, isBinary: boolean) {
        if (!isBinary) {
            this.logger.warn("received non-binary message, skipping");
            return;
        }
        // Server pushes are msgpack [route, data]
        const [route, data] = unpack(message) as [number, unknown];
        if (route === BASE_ROUTES.PONG) {
            this.logger.debug("received pong", "value", data);
            return;
        }
        const listener = this.listeners.get(route);
        if (listener === undefined) {
            this.logger.warn("no listener for websocket route", "route", route);
            return;
        }
        listener(data);
    }

    /**
     * Listen for server→client pushes on a route. The websocket is receive-only;
     * client→server calls go through ApiClient.
     */
    public on(route: number, listener: Listener) {
        this.listeners.set(route, listener);
    }

    public getStatus(): ConnectionStatus {
        return this.status;
    }

    public isConnected(): boolean {
        return this.status.state === "connected";
    }

    public waitForStatusUpdate(): ConnectionStatus | Events.Terminate {
        while (this.status.state === "connecting") {
            const event = Threads.pullEvent(["websocket_connection_state"]);
            if (event instanceof Events.Terminate) {
                return event;
            }
            if (event.connectionId === this.connectionId) {
                break;
            }
        }

        return this.status;
    }

    public waitForConnection(): ConnectionStatus | Events.Terminate {
        while (this.status.state === "connecting") {
            const event = Threads.pullEvent(["websocket_connection_state"]);
            if (event instanceof Events.Terminate) {
                return event;
            }
            if (event.connectionId !== this.connectionId) {
                continue;
            }
        }

        return this.status;
    }

    public ping(value: number) {
        if (this.websocket === undefined) {
            this.logger.warn("websocket not connected, skipping ping");
            return;
        }
        const data = pack([BASE_ROUTES.PING, value]);
        this.logger.debug(
            "pinging websocket",
            "value",
            value,
            "pack_b64",
            base64encode(data),
        );
        this.websocket.send(data, true);
    }
}
