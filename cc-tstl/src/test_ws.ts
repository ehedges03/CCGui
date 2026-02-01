import {
    pullEventAs,
    WebSocketCloseEvent,
    WebSocketMessageEvent,
} from "./api/event";
import { pack, unpack } from "./api/MessagePack";
import { base64encode, verifyVersion } from "./utils";

const REMOTE_BASE_URL = "ws://localhost:8080/ws";

verifyVersion();

class WebsocketService {
    private websocket: WebSocket | undefined;
    private url: string | undefined;

    public connect(url: string, apiKey: string): boolean {
        const headers = new LuaMap<string, string>();
        headers.set("Authorization", `Bearer ${apiKey}`);
        const [websocket, error] = http.websocket(url, headers);

        if (websocket === false) {
            throw "websocket failed to connect" + error;
        }
        this.websocket = websocket;
        this.url = url;
        parallel.waitForAll(
            () => this.handleClose(),
            () => this.handleMessage(),
            () => {
                let i = 0;
                while (this.connected()) {
                    this.ping(i++);
                    os.sleep(0);
                }
            },
        );

        return true;
    }

    private handleClose() {
        print("loopin close");
        while (this.websocket !== undefined) {
            print("head close");
            const websocketClosedEvent = pullEventAs(
                WebSocketCloseEvent,
                "websocket_closed",
            );
            if (websocketClosedEvent === undefined) continue;
            if (websocketClosedEvent.url === this.url) {
                this.websocket = undefined;
                this.url = undefined;
                print(
                    "websocket closed",
                    websocketClosedEvent.reason,
                    websocketClosedEvent.code,
                );
            }
        }
        print("done close");
    }

    private handleMessage() {
        print("loopin message");
        while (this.websocket !== undefined) {
            print("head message");
            const websocketMessageEvent = pullEventAs(
                WebSocketMessageEvent,
                "websocket_message",
            );
            if (websocketMessageEvent === undefined) continue;
            if (websocketMessageEvent.url === this.url) {
                if (!websocketMessageEvent.isBinary) {
                    throw "message should be binary";
                }
                const data = unpack(websocketMessageEvent.content);
                print(textutils.serialiseJSON(data));
            }
        }
        print("done message");
    }

    public connected(): boolean {
        return this.websocket !== undefined;
    }

    public ping(value: number) {
        const data = pack([0, value]);
        print(base64encode(data));
        this.websocket?.send(data, true);
    }
}

const wsService = new WebsocketService();

wsService.connect(
    REMOTE_BASE_URL,
    "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g",
);
