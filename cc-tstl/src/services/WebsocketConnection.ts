import { pack, unpack } from "../lib/MessagePack";
import { Logger } from "../lib/log";
import { base64encode } from "../lib/utils";
import { Events } from "../system/event";
import { Threads } from "../system/threads";

const logger = new Logger("WebsocketConnection");

type Listener = (message: any) => void;

// Seconds between pings
const PING_RATE = 30;

enum BASE_ROUTES {
    PING = 0,
    PONG = 1,
}

export class WebsocketConnection {
    private static readonly RETRY_RATE = 10;
    private running = true;
    private url: string | undefined;
    private apiKey: string | undefined;

    private websocket: WebSocket | undefined;
    private lastPingPongTime: number = 0;

    public setUrl(url: string) {
        this.url = url;
    }

    public setCredentials(apiKey: string) {
        this.apiKey = apiKey;
    }

    public start() {
        this.running = true;
        const pingingThread = Threads.createThread(
            () => {
                while (this.running) {
                    Threads.sleep(PING_RATE);
                    this.ping(0);
                }
            },
            { debugId: "ws_pinging" },
        );
        const connectionThread = Threads.createThread(
            () => {
                while (this.running) {
                    if (!this.connected() && this.url && this.apiKey) {
                        if (this.url != undefined && this.apiKey != undefined) {
                            try {
                                this.connect(this.url, this.apiKey);
                            } catch (e) {
                                logger.error(
                                    `failed to connect websocket: ${e}`,
                                );
                            }
                        } else {
                            Threads.sleep(WebsocketConnection.RETRY_RATE);
                        }
                    } else {
                    }
                }
            },
            { priority: Threads.Priorities.HIGHEST, debugId: "ws_connection" },
        );
        connectionThread.start();
        pingingThread.start();
    }

    public stop() {
        this.running = false;
        if (this.websocket === undefined) {
            logger.warn("websocket not connected, skipping close");
            return;
        }
        this.websocket.close();
    }

    public connect(url: string, apiKey: string): boolean {
        const headers = new LuaMap<string, string>();
        headers.set("Authorization", `Bearer ${apiKey}`);
        http.websocketAsync(url, headers);
        const event = Threads.pullEvent([
            "websocket_success",
            "websocket_failure",
        ]);
        logger.trace(`websocket event: ${event.get_name()}`);
        if (event.get_name() === "websocket_success") {
            this.websocket = event.handle;
            logger.debug(
                `websocket connected to ${url} with handle ${this.websocket}`,
            );
        } else {
            logger.error(`websocket failed to connect ${event.error}`);
            Threads.sleep(WebsocketConnection.RETRY_RATE);
        }

        this.url = url;
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

    public connected(): boolean {
        return this.websocket !== undefined;
    }

    public send(message: any) {
        if (this.running) {
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
