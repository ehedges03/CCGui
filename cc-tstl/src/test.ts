declare const _CC_VERSION: string | undefined;

const REMOTE_BASE_URL = "http://localhost:8080";

const MIN_CC_VERSION = "1.85.0";

function versionToParts(version: string): [number, number, number] {
    const parts = version.split(".");
    return [
        parseInt(parts[0] ?? "0"),
        parseInt(parts[1] ?? "0"),
        parseInt(parts[2] ?? "0"),
    ];
}

function requireMinVersion(minVersion: string): void {
    let version: string | undefined;
    if (_CC_VERSION) {
        version = _CC_VERSION;
        print("Using _CC_VERSION: " + version);
    } else if (!_HOST) {
        version = string.gsub(os.version(), "CraftOS ", "")[0];
        print("Using os.version(): " + version);
    } else {
        version = string.match(_HOST, "ComputerCraft ([0-9%.]+)")[0];
        print("Using _HOST: " + version);
    }
    if (!version) {
        error("Could not determine version of ComputerCraft");
    } else {
        const versionParts = versionToParts(version);
        const minParts = versionToParts(minVersion);
        assert(
            versionParts[0] >= minParts[0] &&
                versionParts[1] >= minParts[1] &&
                versionParts[2] >= minParts[2],
            "This program requires ComputerCraft " + minVersion + " or later.",
        );
        print(
            "Version is " +
                version +
                " which is greater than or equal to " +
                minVersion,
        );
    }
}

requireMinVersion(MIN_CC_VERSION);

class HelloService {
    public greet(name: string): string {
        
        print(`Making post to ${REMOTE_BASE_URL}/hello.v1.HelloService/Greet with body ${textutils.serialiseJSON({ name })}`);
        const headers = new LuaMap<string, string>();
        headers.set("Content-Type", "application/json");

        const [valid_response, error_message, response] = http.post(
            `${REMOTE_BASE_URL}/hello.v1.HelloService/Greet`,
            textutils.serialiseJSON({ name }),
            headers,
        );
        if (valid_response === undefined) {
            if (response !== undefined) {
                print(response.getResponseCode());
                print(response.getResponseHeaders());
                print(response.readAll());
            }
            throw error("Failed to greet: " + error_message);
        } else {
            const body = valid_response.readAll();
            if (body === undefined) {
                throw error("Failed to read response body");
            }
            return body;
        }
    }
}

print("Making request to greet...");
const helloService = new HelloService();
const response = helloService.greet("World");
print(response);
