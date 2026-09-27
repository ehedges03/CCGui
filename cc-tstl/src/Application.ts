import { Logger } from "./lib/log";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Threads } from "./system/threads";

const logger = new Logger("Application");

export class Application implements Threads.Runnable {
    public run() {
        const wsService = new WebsocketConnection();
        wsService.setUrl("ws://localhost:8080/ws");
        wsService.setCredentials(
            "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g",
        );
        wsService.start();

        let i = 0;
        while (wsService.waitForConnectionState() === "connected") {
            wsService.ping(i++);
            Threads.yield();
            if (i > 10) {
                wsService.stop();
            }
        }
        wsService.stop();
        logger.info("done");
    }
}
