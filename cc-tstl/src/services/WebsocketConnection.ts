import { pack, unpack } from "../lib/MessagePack";
import { Logger } from "../lib/log";
import { base64encode } from "../lib/utils";
import { Events } from "../system/event";
import { Threads } from "../system/threads";

const logger = new Logger("WebsocketConnection");

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
            logger.warn("websocket not connected, skipping close");
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

        logger.trace(`websocket event: ${event.get_name()}`);
        if (event.get_name() === "websocket_success") {
            this.websocket = event.handle;
            this.setStatus({ state: "connected" });
            logger.debug(
                `websocket connected to ${this.url} with handle ${this.websocket}`,
            );
        } else {
            this.setStatus({
                state: "connecting",
                attempts: attempts + 1,
                lastError: event.error,
            });
            logger.error(`websocket failed to connect ${event.error}`);
            Threads.sleep(WebsocketConnection.RETRY_RATE);
            return false;
        }
        return true;
    }

    private handle() {
        logger.trace("listing for websocket events");
        while (this.websocket !== undefined) {
            logger.trace("waiting for websocket event");
            const event = Threads.pullEvent([
                "websocket_closed",
                "websocket_message",
            ]);
            if (event.url !== this.url) {
                continue;
            }
            if (event instanceof Events.WebSocketMessage) {
                logger.trace("received websocket_message event");
                this.handleMessage(event.content, event.isBinary);
            } else if (event instanceof Events.WebSocketClose) {
                logger.info(
                    `websocket closed reason=${event.reason ?? "unknown"} code=${event.code ?? "unknown"}`,
                );
                this.websocket.close();
                this.websocket = undefined;
                this.url = undefined;
                break;
            }
        }
        logger.trace("exiting websocket listener");
    }

    private handleMessage(message: string, isBinary: boolean) {
        if (!isBinary) {
            logger.warn("received non-binary message, skipping");
            return;
        }
        const data = unpack(message);
        logger.debug(textutils.serialiseJSON(data));
    }

    public send(message: any) {
        if (this.status.state !== "connected") {
            logger.error(
                "websocket connection is stopped, unable to send message",
            );
            return;
        }

        while (this.websocket === undefined) {
            logger.warn(
                "websocket not connected, unable to send message, retrying...",
            );
            Threads.yield();
        }
        const data = pack(message);
        logger.debug(
            `sending websocket message ${message} pack-b64: ${base64encode(data)}`,
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
            logger.warn("websocket not connected, skipping ping");
            return;
        }
        const data = pack([BASE_ROUTES.PING, value]);
        logger.debug(
            `pinging websocket with value ${value} pack-b64: ${base64encode(data)}`,
        );
        this.websocket.send(data, true);
    }
}
