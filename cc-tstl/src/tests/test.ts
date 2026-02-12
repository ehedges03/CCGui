import { Logger } from "../lib/log";
import { verifyVersion } from "../lib/utils";

const REMOTE_BASE_URL = "http://localhost:8080";
const logger = new Logger("TestHello");

verifyVersion();

class HelloService {
    public greet(name: string): string {
        
        logger.info(
            `Making post to ${REMOTE_BASE_URL}/hello.v1.HelloService/Greet with body ${textutils.serialiseJSON({ name })}`,
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
                logger.debug(response.getResponseCode());
                logger.debug(textutils.serialiseJSON(response.getResponseHeaders()));
                logger.debug(response.readAll());
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

logger.info("Making request to greet...");
const helloService = new HelloService();
const response = helloService.greet("World");
logger.info(response);
