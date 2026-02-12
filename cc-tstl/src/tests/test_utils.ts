import { Logger } from "../lib/log";
import { base64decode, base64encode, verifyVersion } from "../lib/utils";
import { pack, unpack } from "../lib/MessagePack";
import { Infer, z } from "../lib/zod-lite";

verifyVersion();
const logger = new Logger("TestUtils");

const testString = "Hello, world!";

const encodedString = base64encode(testString);
const decodedString = base64decode(encodedString);

logger.debug(testString);
logger.debug(encodedString);
logger.debug(decodedString);

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

logger.debug(textutils.serialiseJSON(packedObject));
logger.debug(textutils.serialiseJSON(unpackedObject));

const parsedObject = testObjectSchema.parse(unpackedObject);

// const failParse = testObjectSchema.safeParse({
//     name: "John",
//     age: "30",
//     city: 1,
// });

// print(textutils.serialiseJSON(failParse));

assert(parsedObject.name === testObject.name && parsedObject.age === testObject.age && parsedObject.city === testObject.city, "Unpacked object does not match test object");

const websocketClosedArgsSchema = z.literalArray([z.literal("websocket_closed"), z.string(), z.string().default(undefined), z.number().default(undefined)])
let fail = websocketClosedArgsSchema.safeParse(["websocket_closed", "url"])
logger.debug(textutils.serialiseJSON(fail))
