import { Events } from "../system/event";
import { Threads } from "../system/threads";

export type ApiResult<T> =
    | { success: true; data: T }
    | { success: false; code: string; message: string };

/**
 * Client→server calls: Connect unary procedures over plain HTTP POST with JSON.
 * Responses are matched by URL, so calls to the same procedure must not overlap.
 * Does not abort on terminate: an in-flight call runs to completion.
 */
export class ApiClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    /** @param procedure e.g. "log.v1.LogService/ShipLogs" */
    public call<T = unknown>(procedure: string, body: object): ApiResult<T> {
        const url = `${this.baseUrl}/${procedure}`;
        const headers = new LuaMap<string, string>();
        headers.set("Content-Type", "application/json");
        headers.set("Authorization", `Bearer ${this.apiKey}`);
        http.request(url, textutils.serializeJSON(body), headers);

        let event: Events.HTTP;
        do {
            event = Threads.pullEvent(["http_success", "http_failure"]);
        } while (event.url !== url);

        const text = event.handle?.readAll() ?? "";
        event.handle?.close();
        if (event.error === undefined) {
            return { success: true, data: textutils.unserializeJSON(text) };
        }
        // Connect error bodies are {"code": "...", "message": "..."}
        const err = textutils.unserializeJSON(text) as
            | { code?: string; message?: string }
            | undefined;
        return {
            success: false,
            code: err?.code ?? "unavailable",
            message: err?.message ?? event.error,
        };
    }
}
