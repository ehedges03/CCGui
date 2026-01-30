import { base64decode, base64encode, verifyVersion } from "./utils";
import { pack, unpack } from "./api/MessagePack";
import { Infer, z } from "./zod-lite";

verifyVersion();

const testString = "Hello, world!";

const encodedString = base64encode(testString);
const decodedString = base64decode(encodedString);

print(testString);
print(encodedString);
print(decodedString);

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

print(textutils.serialiseJSON(packedObject));
print(textutils.serialiseJSON(unpackedObject));

const parsedObject = testObjectSchema.parse(unpackedObject);

const failParse = testObjectSchema.safeParse({
    name: "John",
    age: "30",
    city: "New York",
});

print(textutils.serialiseJSON(failParse));

assert(parsedObject.name === testObject.name && parsedObject.age === testObject.age && parsedObject.city === testObject.city, "Unpacked object does not match test object");
