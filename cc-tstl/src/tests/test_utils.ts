import { log } from "../lib/log";
import { base64decode, base64encode, verifyVersion } from "../lib/utils";
import { pack, unpack } from "../lib/MessagePack";
import { Infer, z } from "../lib/zod-lite";

verifyVersion();

const testString = "Hello, world!";

const encodedString = base64encode(testString);
const decodedString = base64decode(encodedString);

log.debug("base64 test string", "value", testString);
log.debug("base64 encoded", "value", encodedString);
log.debug("base64 decoded", "value", decodedString);

assert(decodedString === testString, "Decoded string does not match test string");

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

assert(parsedObject.name === testObject.name && parsedObject.age === testObject.age && parsedObject.city === testObject.city, "Unpacked object does not match test object");

const websocketClosedArgsSchema = z.literalArray([z.literal("websocket_closed"), z.string(), z.string().default(undefined), z.number().default(undefined)])
let fail = websocketClosedArgsSchema.safeParse(["websocket_closed", "url"])
log.debug("websocket closed schema parse", "result", fail)
