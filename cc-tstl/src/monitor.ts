import { log } from "./lib/log";
import { base64decode, base64encode, verifyVersion } from "./lib/utils";
import { pack, unpack } from "./lib/MessagePack";
import { Infer, z } from "./lib/zod-lite";
import { Events } from "./system/event";

const REMOTE_BASE_URL = "http://localhost:8080";

verifyVersion();

const testObject = {
    name: "John",
    age: 30,
    city: "New York",
};

const testObjectSchema = z.object({
    name: z.string(),
    age: z.number(),
    city: z.string(),
});

const packedObject = pack(testObject);
const unpackedObject = unpack(packedObject);

log.debug("packed object", "data", packedObject);
log.debug("unpacked object", "data", unpackedObject);

const parsedObject = testObjectSchema.parse(unpackedObject);

const failParse = testObjectSchema.safeParse({
    name: "John",
    age: "30",
    city: "New York",
});

log.debug("failed parse", "data", failParse);

assert(parsedObject.name === testObject.name && parsedObject.age === testObject.age && parsedObject.city === testObject.city, "Unpacked object does not match test object");

class WebsocketService {
    private websocket: WebSocket | undefined = undefined;
    private url: string | undefined = undefined
    
    public connect(url: string, apiKey: string): boolean {
        const headers = new LuaMap<string, string>()
        headers.set("Authorization", `Bearer ${apiKey}`)
        const [websocket, error] = http.websocket(url, headers)
        log.error("websocket connect failed", "err", tostring(error))
        if (websocket === false) {
            return false;
        }
        this.websocket = websocket;
        return true;
    }
    
    private handleDisconnect() {
        while (this.websocket !== undefined) {
            // const {match, event} = Events.pullEventAs(Events.WebSocketConnect)
            // if (!match) continue;

            // event.get_name
        }
    }
}