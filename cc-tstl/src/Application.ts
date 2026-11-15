import * as log from "./lib/log";
import { ApiClient } from "./services/ApiClient";
import { LogShipper } from "./services/LogShipper";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Events } from "./system/event";
import { Threads } from "./system/threads";

export class Application implements Threads.Runnable {
    public run() {
        const apiKey =
            "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g";

        const logShipper = new LogShipper(
            new ApiClient("http://localhost:8080", apiKey),
        );
        log.addConsumer(logShipper.getConsumer());
        logShipper.start();

        const wsService = new WebsocketConnection(
            "ws://localhost:8080/ws",
            apiKey,
        );
        wsService.start();

        let i = 0;

        while (true) {
            const status = wsService.waitForConnection();
            if (
                status instanceof Events.Terminate ||
                status.state !== "connected"
            ) {
                break;
            }
            wsService.ping(i++);
            if (Threads.yield() instanceof Events.Terminate) {
                log.debug("application recieved terminate");
                break;
            }
            if (i > 10) {
                wsService.stop();
            }
        }
        wsService.stop();
        log.info("application done");
    }
}
