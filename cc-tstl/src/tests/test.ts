import { log } from "../lib/log";
import { verifyVersion } from "../lib/utils";

const REMOTE_BASE_URL = "http://localhost:8080";

verifyVersion();

class HelloService {
    public greet(name: string): string {
        log.info(
            "making greet request",
            "url",
            `${REMOTE_BASE_URL}/hello.v1.HelloService/Greet`,
            "body",
            { name },
        );
        const headers = new LuaMap<string, string>();
        headers.set("Content-Type", "application/json");

        const [valid_response, error_message, response] = http.post(
            `${REMOTE_BASE_URL}/hello.v1.HelloService/Greet`,
            textutils.serialiseJSON({ name }),
            headers,
        );
        if (valid_response === undefined) {
            if (response !== undefined) {
                log.debug("greet response code", "code", response.getResponseCode());
                log.debug(
                    "greet response headers",
                    "headers",
                    response.getResponseHeaders(),
                );
                log.debug("greet response body", "body", response.readAll());
            }
            throw error("Failed to greet: " + error_message);
        } else {
            const body = valid_response.readAll();
            if (body === undefined) {
                throw "Failed to read response body";
            }
            return body;
        }
    }
}

log.info("making request to greet");
const helloService = new HelloService();
const response = helloService.greet("World");
log.info("greet response", "response", response);
